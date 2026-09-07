"""Native folder dialog, spawned only after the user clicks Escolher pasta."""
import json
from .processes import read_payload


def main():
    read_payload()
    import tkinter as tk
    from tkinter import filedialog
    root = tk.Tk()
    root.withdraw()
    root.attributes("-topmost", True)
    try:
        selected = filedialog.askdirectory(parent=root, title="FileNest — escolher pasta", mustexist=True)
        print(json.dumps({"path": selected or None}))
    finally:
        root.destroy()


if __name__ == "__main__":
    main()
