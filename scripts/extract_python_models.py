import ast
import json
import sys
import os

def parse_python_file(filepath):
    if not os.path.exists(filepath):
        print(f"Error: File {filepath} not found", file=sys.stderr)
        sys.exit(1)

    with open(filepath, 'r', encoding='utf-8') as f:
        tree = ast.parse(f.read())

    models = {}
    for node in ast.walk(tree):
        if isinstance(node, ast.ClassDef):
            fields = []
            for item in node.body:
                if isinstance(item, ast.AnnAssign):
                    annotation_str = ast.unparse(item.annotation)
                    fields.append({
                        "name": item.target.id,
                        # Check for Optional[...] or X | None
                        "nullable": "Optional" in annotation_str or "None" in annotation_str
                    })
            
            if fields:
                models[node.name] = fields

    return models

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python extract_python_models.py <path_to_python_file>", file=sys.stderr)
        sys.exit(1)
    print(json.dumps(parse_python_file(sys.argv[1])))