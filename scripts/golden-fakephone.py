"""Connect golden-surface's own FakePhone (tests/fake_phone.py) to a relay, for the bridge's
Golden Surface conformance test. Usage: golden-fakephone.py <golden-surface dir> <relay base> <app token> <seconds>"""
import asyncio
import sys

sys.path.insert(0, sys.argv[1] + "/tests")
from fake_phone import FakePhone  # noqa: E402


async def main():
    p = FakePhone(sys.argv[2], sys.argv[3])
    await p.connect()
    print("connected", flush=True)
    await asyncio.sleep(float(sys.argv[4]))
    await p.close()

asyncio.run(main())
