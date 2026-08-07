from pathlib import Path

files = [
    "src/routes/api/astrostack/qualify.ts",
    "src/routes/api/astrostack/stack-trigger.ts",
    "src/routes/api/cosmos/analyze-cluster.ts",
    "src/routes/api/cosmos/report.ts",
]

replacements = {
    "upload e": "uploadée",
    "qualit ": "qualité",
    "Appel ": "Appelé",
    "apr s": "après",
    "R cup re": "Récupère",
    "m tadonn es": "métadonnées",
    "r sultats": "résultats",
    "Met   jour": "Met à jour",
    "donn ": "donné",
    "S lectionne": "Sélectionne",
    "qualifi es": "qualifiées",
    "V rifie": "Vérifie",
    "Cr e": "Crée",
    "compl tion": "complétion",
    "compl t ": "complété",
    "d l gu ": "délégué",
    "stack es": "stackées",
    "r centes": "récentes",
    " v nement": "événement",
    "Ins re": "Insère",
    "D clenche": "Déclenche",
    "syst me": "système",
    "calcul e": "calculée",
}

for file in files:
    path = Path(file)
    data = path.read_bytes()

    text = None

    for encoding in ("utf-8", "cp1252", "latin-1"):
        try:
            text = data.decode(encoding)
            print(f"{file}: lecture {encoding}")
            break
        except UnicodeDecodeError:
            pass

    if text is None:
        raise Exception(f"Impossible de lire {file}")

    for old, new in replacements.items():
        text = text.replace(old, new)

    text = text.replace("   ", " × ")

    path.write_text(
        text,
        encoding="utf-8",
        newline="\n"
    )

    print(f"Corrigé : {file}")

print("Conversion terminée")