#!/usr/bin/env python3
"""
Generate Wedding Smile Catcher architecture diagram using diagrams library.

Usage:
    python scripts/generate_architecture_diagram.py

Output:
    docs/architecture/wedding_smile_catcher_architecture.png
"""

import os

from diagrams import Cluster, Diagram, Edge
from diagrams.gcp.compute import Functions
from diagrams.gcp.database import Firestore
from diagrams.gcp.ml import AIPlatform, VisionAPI
from diagrams.gcp.storage import Storage
from diagrams.onprem.client import Users
from diagrams.programming.framework import React

# Output path
OUTPUT_DIR = "docs/architecture"
OUTPUT_NAME = "wedding_smile_catcher_architecture"

os.makedirs(OUTPUT_DIR, exist_ok=True)

graph_attr = {
    "fontsize": "14",
    "fontname": "Helvetica Bold",
    "bgcolor": "white",
    "pad": "1.0",
    "nodesep": "1.0",
    "ranksep": "2.0",
    "splines": "ortho",
}

node_attr = {
    "fontsize": "11",
    "fontname": "Helvetica",
}

edge_attr = {
    "fontsize": "10",
    "fontname": "Helvetica",
}

with Diagram(
    "Wedding Smile Catcher - System Architecture",
    filename=f"{OUTPUT_DIR}/{OUTPUT_NAME}",
    show=False,
    direction="LR",
    graph_attr=graph_attr,
    node_attr=node_attr,
    edge_attr=edge_attr,
):
    # Stage 1: Users (左端)
    with Cluster("Users"):
        guests = Users("LINE\nGuests")

    # Stage 2: Webhook (左から2番目)
    with Cluster("① Webhook"):
        webhook = Functions("Webhook\nHandler")

    # Stage 3: Scoring + AI (中央)
    with Cluster("② Scoring"):
        scoring = Functions("Scoring\nHandler")

        with Cluster("AI Services"):
            vision = VisionAPI("Vision API")
            vertex = AIPlatform("Vertex AI")

    # Stage 4: Storage (右から2番目)
    with Cluster("③ Data"):
        storage = Storage("Cloud\nStorage")
        firestore = Firestore("Firestore")

    # Stage 5: Frontend (右端)
    with Cluster("④ Display"):
        frontend = React("Firebase\nHosting")

    # Flow: Left to Right
    guests >> Edge(color="blue", penwidth="2") >> webhook
    webhook >> Edge(color="blue") >> storage
    webhook >> Edge(color="blue") >> firestore
    webhook >> Edge(style="dashed", color="gray") >> scoring

    scoring >> Edge(color="green") >> vision
    scoring >> Edge(color="green") >> vertex
    scoring >> Edge(color="green") >> firestore
    scoring >> Edge(style="dashed", color="orange") >> guests

    firestore >> Edge(color="purple") >> frontend

print(f"Generated: {OUTPUT_DIR}/{OUTPUT_NAME}.png")
