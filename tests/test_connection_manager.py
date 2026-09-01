"""Regression tests for websocket index cleanup after send failures."""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import main


class FakeSocket:
    def __init__(self, *, fail=False):
        self.fail = fail
        self.messages = []

    async def accept(self):
        """Mirror Starlette's websocket handshake for connect() tests."""
        return None

    async def send_text(self, message):
        if self.fail:
            raise RuntimeError("socket closed")
        self.messages.append(message)


class ConnectionManagerTests(unittest.IsolatedAsyncioTestCase):
    def make_manager_with(self, websocket, client_id):
        manager = main.ConnectionManager()
        manager.active_connections.append(websocket)
        manager.connection_clients[websocket] = client_id
        manager.user_connections[client_id] = websocket
        return manager

    async def test_broadcast_failure_removes_reverse_indexes_and_online_count(self):
        websocket = FakeSocket(fail=True)
        manager = self.make_manager_with(websocket, "alice")

        await manager.broadcast_count()

        self.assertEqual(manager.active_connections, [])
        self.assertNotIn(websocket, manager.connection_clients)
        self.assertNotIn("alice", manager.user_connections)
        self.assertEqual(manager.online_count(), 0)

    async def test_failed_old_socket_does_not_remove_new_socket_for_same_client(self):
        old = FakeSocket(fail=True)
        current = FakeSocket()
        manager = main.ConnectionManager()
        manager.active_connections.extend([old, current])
        manager.connection_clients[old] = "alice"
        manager.connection_clients[current] = "alice"
        # ``connect`` replaces this reverse mapping when a client reconnects.
        manager.user_connections["alice"] = current

        await manager.broadcast_canvas_updated("canvas-1", 4)

        self.assertEqual(manager.active_connections, [current])
        self.assertNotIn(old, manager.connection_clients)
        self.assertEqual(manager.connection_clients[current], "alice")
        self.assertIs(manager.user_connections["alice"], current)

    async def test_personal_send_failure_is_cleaned_and_disconnect_is_idempotent(self):
        websocket = FakeSocket(fail=True)
        manager = self.make_manager_with(websocket, "alice")

        await manager.send_personal_message({"type": "done"}, "alice")
        # A later disconnect callback from Starlette must not raise after the
        # broadcast path already evicted the socket.
        await manager.disconnect(websocket, "alice")

        self.assertEqual(manager.active_connections, [])
        self.assertEqual(manager.connection_clients, {})
        self.assertEqual(manager.user_connections, {})

    async def test_reconnect_evicts_previous_socket_for_same_client(self):
        old = FakeSocket()
        current = FakeSocket()
        manager = main.ConnectionManager()
        manager.active_connections.append(old)
        manager.connection_clients[old] = "alice"
        manager.user_connections["alice"] = old

        # ``connect`` must leave one authoritative socket even when Starlette
        # has not delivered the old disconnect callback yet.
        await manager.connect(current, "alice")

        self.assertEqual(manager.active_connections, [current])
        self.assertNotIn(old, manager.connection_clients)
        self.assertIs(manager.user_connections["alice"], current)


if __name__ == "__main__":
    unittest.main()
