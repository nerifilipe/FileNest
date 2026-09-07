"""Only invoked by isolation tests; never accepts an API request."""
import json
import time
from backend.processes import read_payload

payload = read_payload()
if payload["action"] == "sleep":
    time.sleep(20)
elif payload["action"] == "memory":
    try:
        blocks = [bytearray(8 * 1024 * 1024) for _ in range(128)]
        print(json.dumps({"limited": False}))
    except MemoryError:
        print(json.dumps({"limited": True}))
elif payload["action"] == "tk":
    import tkinter
    root = tkinter.Tk()
    root.withdraw()
    root.destroy()
    print(json.dumps({"tk": True}))
