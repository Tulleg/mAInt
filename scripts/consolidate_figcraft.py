import json
import os
import subprocess
import zipfile

def consolidate_mockups():
    base_dir = os.path.abspath(os.path.dirname(__file__) + "/..")
    docs_dir = os.path.join(base_dir, "docs")
    screenshots_dir = os.path.join(docs_dir, "screenshots")
    os.makedirs(screenshots_dir, exist_ok=True)

    frames_spec = [
        {
            "file": "mockup-light-theme.figcraft",
            "name": "01 - Startseite (Workspace initial)",
            "x": 0.0,
            "y": 0.0
        },
        {
            "file": "mockup-table-view.figcraft",
            "name": "02 - Abfrageergebnis (Dynamische Ergebnistabelle)",
            "x": 2100.0,
            "y": 0.0
        },
        {
            "file": "mockup-chart-view.figcraft",
            "name": "03 - KI-Diagrammansicht (Prompt-to-Chart)",
            "x": 4200.0,
            "y": 0.0
        },
        {
            "file": "mockup-login-page.figcraft",
            "name": "04 - Login & SSO",
            "x": 6300.0,
            "y": 0.0
        },
        {
            "file": "mockup-admin-settings.figcraft",
            "name": "05 - Admin & Grundkonfiguration",
            "x": 8400.0,
            "y": 0.0
        }
    ]

    target_figcraft = os.path.join(docs_dir, "maint-ai-design-system.figcraft")
    temp_figcraft = "/tmp/maint-ai-design-system-raw.figcraft"

    merged_doc = {
        "format": "figcraft",
        "version": 1,
        "imageIndex": [],
        "name": "maint-ai-design-system",
        "pages": [1],
        "current_page": 1,
        "styles": [],
        "variables": {"collections": [], "variables": []},
        "document_colors": [],
        "comments": [],
        "nodes": {}
    }

    page_node = {
        "id": 1,
        "name": "MaintAI Design System",
        "type": "page",
        "background": {"r": 0.9607843, "g": 0.9607843, "b": 0.9607843, "a": 1.0},
        "flows": [],
        "prototype": {
            "device": "None",
            "background": {"r": 0.11764706, "g": 0.11764706, "b": 0.11764706, "a": 1.0},
            "rotation": "portrait"
        },
        "guides": [],
        "children": [],
        "width": 0.0,
        "height": 0.0
    }
    merged_doc["nodes"]["1"] = page_node

    next_id = 2

    for spec in frames_spec:
        src_path = os.path.join(docs_dir, spec["file"])
        print(f"Reading {spec['file']}...")
        with zipfile.ZipFile(src_path, "r") as z:
            data = json.loads(z.read("document.json").decode("utf-8"))

        src_nodes = data["nodes"]
        src_page_id = str(data["pages"][0])
        top_frame_id = data["nodes"][src_page_id]["children"][0]

        # Remap IDs
        id_map = {}
        for old_id_str in src_nodes:
            old_id = int(old_id_str)
            if old_id == int(src_page_id):
                continue
            id_map[old_id] = next_id
            next_id += 1

        # Deep copy nodes with mapped IDs
        for old_id_str, node in src_nodes.items():
            old_id = int(old_id_str)
            if old_id == int(src_page_id):
                continue

            new_node = json.loads(json.dumps(node))
            new_id = id_map[old_id]
            new_node["id"] = new_id

            # Parent remapping
            if node.get("parent") == int(src_page_id):
                new_node["parent"] = 1
            elif "parent" in node and node["parent"] in id_map:
                new_node["parent"] = id_map[node["parent"]]

            # Children remapping
            if "children" in new_node:
                new_node["children"] = [id_map[c] for c in new_node["children"] if c in id_map]

            # Top-level frame positioning & naming
            if old_id == top_frame_id:
                new_node["name"] = spec["name"]
                new_node["width"] = 1920.0
                new_node["height"] = 1080.0
                if spec["x"] != 0.0 or spec["y"] != 0.0:
                    new_node["transform"] = [1.0, 0.0, 0.0, 1.0, float(spec["x"]), float(spec["y"])]
                else:
                    new_node.pop("transform", None)
                page_node["children"].append(new_id)

            merged_doc["nodes"][str(new_id)] = new_node

    merged_doc["next_id"] = next_id

    # Write initial merged file
    with zipfile.ZipFile(temp_figcraft, "w", compression=zipfile.ZIP_DEFLATED) as z:
        z.writestr("document.json", json.dumps(merged_doc, indent=2))
        with zipfile.ZipFile(os.path.join(docs_dir, frames_spec[0]["file"]), "r") as z_src:
            z.writestr("thumbnail.png", z_src.read("thumbnail.png"))

    figcraft_bin = os.path.join(base_dir, "node_modules/.bin/figcraft-cli")
    if not os.path.exists(figcraft_bin):
        figcraft_bin = "/tmp/appimage_extracted_8dac694aa8de9b098a3d0472c14e98dc/usr/bin/figcraft-cli"

    # Use figcraft-cli to validate and write final file
    empty_script = "/tmp/empty_script.json"
    with open(empty_script, "w") as f:
        json.dump([], f)

    cmd_save = [figcraft_bin, "run", empty_script, "--in", temp_figcraft, "--out", target_figcraft]
    print(f"Running figcraft-cli to write final file: {' '.join(cmd_save)}")
    res = subprocess.run(cmd_save, capture_output=True, text=True, check=True)
    print(res.stdout)

    # Verify info
    cmd_info = [figcraft_bin, "info", target_figcraft]
    res_info = subprocess.run(cmd_info, capture_output=True, text=True, check=True)
    print(res_info.stdout)

    # Export individual frames to docs/screenshots/
    cmd_export = [figcraft_bin, "export", target_figcraft, "-o", screenshots_dir + "/"]
    print(f"Exporting frames to {screenshots_dir}...")
    res_export = subprocess.run(cmd_export, capture_output=True, text=True, check=True)
    print(res_export.stdout)

    # Render entire overview canvas (8220x1080)
    overview_png = os.path.join(screenshots_dir, "maint-ai-design-system-overview.png")
    cmd_render = [figcraft_bin, "render", target_figcraft, "-o", overview_png]
    print(f"Rendering full canvas overview to {overview_png}...")
    res_render = subprocess.run(cmd_render, capture_output=True, text=True, check=True)
    print(res_render.stdout)

    print("Consolidation and exports successfully completed!")

if __name__ == "__main__":
    consolidate_mockups()
