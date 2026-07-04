"""
predict.py — Prédiction XGBoost PctMarge pour Tandem Logistics
Usage : python predict.py '<json_features>'
"""

import sys
import json
import pickle
import numpy as np
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

def load_model():
    model_path = os.path.join(BASE_DIR, "xgb_marge_final.pkl")
    cols_path  = os.path.join(BASE_DIR, "colonnes_model.pkl")
    with open(model_path, "rb") as f:
        model = pickle.load(f)
    with open(cols_path, "rb") as f:
        columns = pickle.load(f)
    return model, columns

def prepare_features(raw, columns):
    """
    Construit le vecteur complet à partir des features saisies.
    Les colonnes one-hot sont mises à 0 par défaut,
    puis on met à 1 les colonnes correspondant aux valeurs saisies.
    """
    vector = {col: 0 for col in columns}

    # Features numériques directes
    vector["MontantVenteTotalDS"] = float(raw.get("MontantVenteTotalDS", 0))
    vector["NbConteneurs"]        = float(raw.get("NbConteneurs", 0))
    vector["PoidsBrutTotal"]      = float(raw.get("PoidsBrutTotal", 0))
    vector["IsPorteConteneurs"]   = float(raw.get("IsPorteConteneurs", 0))
    vector["HasDangereux"]        = float(raw.get("HasDangereux", 0))

    # One-hot ClientName
    client = raw.get("ClientName", "")
    col_client = f"ClientName_{client}"
    if col_client in vector:
        vector[col_client] = 1

    # One-hot CustomerPostingGroup
    cpg = raw.get("CustomerPostingGroup", "")
    col_cpg = f"CustomerPostingGroup_{cpg}"
    if col_cpg in vector:
        vector[col_cpg] = 1

    # One-hot CountryCode
    country = raw.get("CountryCode", "")
    col_country = f"CountryCode_{country}"
    if col_country in vector:
        vector[col_country] = 1

    # One-hot DesignationNavire
    navire = raw.get("DesignationNavire", "")
    col_navire = f"DesignationNavire_{navire}"
    if col_navire in vector:
        vector[col_navire] = 1

    # One-hot PortOrigine
    port_orig = raw.get("PortOrigine", "")
    col_orig = f"PortOrigine_{port_orig}"
    if col_orig in vector:
        vector[col_orig] = 1

    # One-hot PortDestination
    port_dest = raw.get("PortDestination", "")
    col_dest = f"PortDestination_{port_dest}"
    if col_dest in vector:
        vector[col_dest] = 1

    # One-hot TypeConteneurPrincipal
    conteneur = raw.get("TypeConteneurPrincipal", "")
    col_cont = f"TypeConteneurPrincipal_{conteneur}"
    if col_cont in vector:
        vector[col_cont] = 1

    # Retourner dans l'ordre exact des colonnes
    return np.array([[vector[col] for col in columns]])


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Aucune feature fournie"}), file=sys.stderr)
        sys.exit(1)

    try:
        raw = json.loads(sys.argv[1])
    except json.JSONDecodeError as e:
        print(json.dumps({"error": f"JSON invalide : {e}"}), file=sys.stderr)
        sys.exit(1)

    try:
        model, columns = load_model()
        X = prepare_features(raw, columns)
        prediction = float(model.predict(X)[0])
        print(json.dumps({"pct_marge": round(prediction, 2)}))
        sys.exit(0)
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()