"""
predict_segment.py — Prédiction segment RFM pour Tandem Logistics
Usage : python predict_segment.py '<json_features>'
"""
import joblib
import sys
import json

import numpy as np
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

def load_model():
    kmeans_path = os.path.join(BASE_DIR, "kmeans_rfm_k4.pkl")
    scaler_path = os.path.join(BASE_DIR, "scaler_rfm.pkl")
    labels_path = os.path.join(BASE_DIR, "labels_map_rfm.pkl")

    kmeans_data = joblib.load(kmeans_path)
    scaler      = joblib.load(scaler_path)
    labels_map  = joblib.load(labels_path)

    # kmeans_data est un dict — afficher les clés pour debug
    import sys
    print(f"DEBUG kmeans keys: {kmeans_data.keys() if isinstance(kmeans_data, dict) else type(kmeans_data)}", file=sys.stderr)

    # Extraire le modèle selon la clé disponible
    if isinstance(kmeans_data, dict):
        kmeans = kmeans_data.get('model') or kmeans_data.get('kmeans') or kmeans_data.get('estimator')
    else:
        kmeans = kmeans_data

    return kmeans, scaler, labels_map

def get_recommendation(segment):
    recommendations = {
        "VIP": {
            "action": "Programme fidelite premium",
            "details": [
                "Assigner un gestionnaire de compte dedie",
                "Proposer des tarifs preferentiels",
                "Inviter aux evenements exclusifs Tandem"
            ],
            "priority": "Haute",
            "color": "#C0392B"
        },
        "Fidele": {
            "action": "Upselling services premium",
            "details": [
                "Proposer des services logistiques complementaires",
                "Envoyer une newsletter mensuelle personnalisee",
                "Offres exclusives sur nouveaux services"
            ],
            "priority": "Moyenne",
            "color": "#2C3E50"
        },
        "A risque": {
            "action": "Campagne de reactivation urgente",
            "details": [
                "Contact commercial dans les 48h",
                "Proposer une offre de retour attractive",
                "Analyser les raisons de l'inactivite"
            ],
            "priority": "Urgente",
            "color": "#E67E22"
        },
        "Faible valeur": {
            "action": "Automatiser les interactions",
            "details": [
                "Campagnes marketing low-cost",
                "Evaluer la rentabilite du compte",
                "Envisager une offre self-service"
            ],
            "priority": "Faible",
            "color": "#7F8C8D"
        }
    }
    return recommendations.get(segment, {
        "action": "Analyse requise",
        "details": [],
        "priority": "Indeterminee",
        "color": "#9ca3af"
    })

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
        kmeans, scaler, labels_map = load_model()

        # Features RFM dans l'ordre exact : R, F, M, Marge
        recence   = float(raw.get("Recence", 0))
        frequence = float(raw.get("Frequence", 0))
        ca_total  = float(raw.get("CA_Total", 0))
        marge     = float(raw.get("Marge_Moyenne", 0))

        X = np.array([[recence, frequence, ca_total, marge]])
        X_scaled = scaler.transform(X)
        cluster  = int(kmeans.predict(X_scaled)[0])
        segment  = labels_map.get(cluster, f"Cluster {cluster}")
        recommendation = get_recommendation(segment)

        print(json.dumps({
            "cluster":        cluster,
            "segment":        segment,
            "recommendation": recommendation
        }, ensure_ascii=False))
        sys.exit(0)

    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
