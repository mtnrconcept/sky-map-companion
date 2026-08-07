from pathlib import Path

ROOT = Path(".")

EXTENSIONS = {
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".sql",
    ".json",
    ".md",
}

REPLACEMENTS = {
    " ": "",
    "Ã©": "é",
    "Ã¨": "è",
    "Ãª": "ê",
    "Ã ": "à",
    "Ã¢": "â",
    "Ã´": "ô",
    "Ã»": "û",
    "Ã§": "ç",
    "Ã‰": "É",
    "Ã€": "À",
    "â€™": "'",
    "â€œ": '"',
    "â€\u009d": '"',
    "â€“": "-",
    "Â°": "°",
    "Âµ": "µ",
}

for path in ROOT.rglob("*"):
    if not path.is_file():
        continue

    if path.suffix.lower() not in EXTENSIONS:
        continue

    try:
        raw = path.read_bytes()

        try:
            text = raw.decode("utf-8")
        except UnicodeDecodeError:
            text = raw.decode("cp1252", errors="replace")

        for bad, good in REPLACEMENTS.items():
            text = text.replace(bad, good)

        path.write_text(
            text,
            encoding="utf-8",
            newline="\n"
        )

        print("FIXED", path)

    except Exception as e:
        print("ERROR", path, e)

print("DONE")