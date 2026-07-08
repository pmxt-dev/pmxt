import fs from "fs";
import path from "path";
import yaml from "yaml";
import ts from "typescript";
import { execSync } from "child_process";

interface ModelField {
    name: string;
    required: boolean;
    nullable: boolean;
}

// 1. Load OpenAPI Schema
function loadOpenApi() {
    const file = path.join(process.cwd(), "core/src/server/openapi.yaml");
    if (!fs.existsSync(file)) {
        console.error("❌ OpenAPI schema not found at", file);
        process.exit(1);
    }
    return yaml.parse(fs.readFileSync(file, "utf8"));
}

function extractSchemaModels(schema: any) {
    const result = new Map<string, ModelField[]>();
    const schemas = schema.components?.schemas || {};

    for (const [modelName, model] of Object.entries<any>(schemas)) {
        const fields: ModelField[] = [];
        for (const [name, value] of Object.entries<any>(model.properties || {})) {
            fields.push({
                name,
                required: model.required?.includes(name) ?? false,
                nullable: value.nullable === true
            });
        }
        result.set(modelName, fields);
    }
    return result;
}

// 2. Extract TS Interfaces via Compiler API
function extractTsInterfaces(filePath: string) {
    if (!fs.existsSync(filePath)) {
        console.error("❌ TS file not found at", filePath);
        process.exit(1);
    }

    const source = ts.createSourceFile(
        filePath,
        fs.readFileSync(filePath, "utf8"),
        ts.ScriptTarget.Latest
    );

    const models = new Map<string, ModelField[]>();

    function visit(node: ts.Node) {
        if (ts.isInterfaceDeclaration(node)) {
            const fields: ModelField[] = [];
            node.members.forEach(member => {
                if (ts.isPropertySignature(member)) {
                    fields.push({
                        name: member.name.getText(source),
                        required: !member.questionToken,
                        nullable: member.type?.getText(source).includes("null") ?? false
                    });
                }
            });
            models.set(node.name.text, fields);
        }
        ts.forEachChild(node, visit);
    }

    visit(source);
    return models;
}

// 3. Extract Python Models via Subprocess
function extractPythonModels(filePath: string) {
    const pyScript = path.join(__dirname, "extract_python_models.py");
    let output: string;
    
    try {
        // Try Linux/Mac/GitHub Actions standard first
        output = execSync(`python3 "${pyScript}" "${filePath}"`).toString();
    } catch (e1) {
        try {
            // Fallback to Windows standard
            output = execSync(`python "${pyScript}" "${filePath}"`).toString();
        } catch (e2) {
            try {
                // Fallback to Windows Python Launcher (Your current setup)
                output = execSync(`py "${pyScript}" "${filePath}"`).toString();
            } catch (e3) {
                console.error("❌ Failed to execute Python subprocess. Ensure python3, python, or py is available.");
                process.exit(1);
            }
        }
    }
    
    return JSON.parse(output);
}

// 4. Comparison Engine
function compare() {
    // Adjust these paths to where PMXT's unified generated models actually live
    const TS_MODEL_PATH = path.join(process.cwd(), "sdks/typescript/pmxt/models.ts"); 
    const PY_MODEL_PATH = path.join(process.cwd(), "sdks/python/pmxt/models.py");

    const schema = loadOpenApi();
    const openapiModels = extractSchemaModels(schema);
    const tsModels = extractTsInterfaces(TS_MODEL_PATH);
    
    let pyModels;
    try {
        pyModels = extractPythonModels(PY_MODEL_PATH);
    } catch (e) {
        console.error("❌ Failed to parse Python models.");
        process.exit(1);
    }

    let failed = false;

    for (const [modelName, openapiFields] of openapiModels.entries()) {
        const tsModel = tsModels.get(modelName);
        const pyModel = pyModels[modelName];

        if (!tsModel) {
            console.warn(`⚠️ Missing TS model: ${modelName} (Ignored if intentional)`);
            continue;
        }

        openapiFields.forEach(openapiField => {
            const tsField = tsModel.find(f => f.name === openapiField.name);
            
            if (tsField) {
                if (openapiField.nullable !== tsField.nullable) {
                    console.error(`\n❌ SDK parity failed`);
                    console.error(`Model: ${modelName}`);
                    console.error(`Field: ${openapiField.name}`);
                    console.error(`OpenAPI nullable: ${openapiField.nullable}`);
                    console.error(`TypeScript nullable: ${tsField.nullable}`);
                    console.error(`Fix: Update TypeScript interface to match OpenAPI.\n`);
                    failed = true;
                }
            }
        });
    }

    if (failed) {
        console.error("🚨 Parity check failed. Please fix the mismatches above.");
        process.exit(1);
    } else {
        console.log("✅ SDK Parity Passed! OpenAPI schema aligns with generated code.");
    }
}

compare();