#!/usr/bin/env python3
"""Test for the commands module."""

import unittest

from ee.cli import commands


class CommandsTest(unittest.TestCase):

    def test_command(self):
        self.assertEqual(
            commands._cloud_timestamp_for_timestamp_ms(-1000), "1969-12-31T23:59:59Z"
        )
        self.assertEqual(
            commands._cloud_timestamp_for_timestamp_ms(1000), "1970-01-01T00:00:01Z"
        )


if __name__ == "__main__":
    unittest.main()
