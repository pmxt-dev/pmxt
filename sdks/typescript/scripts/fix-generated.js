const fs = require('fs');
const path = require('path');

const generatedRootDir = path.resolve(__dirname, '../generated');
const generatedModelsDir = path.resolve(__dirname, '../generated/src/models');
const generatedDocsDir = path.resolve(__dirname, '../generated/docs');

function fixOneOfFile(typeName, modelsDir = generatedModelsDir) {
    const targetFile = path.join(modelsDir, `${typeName}.ts`);
    const functionName = `instanceOf${typeName}`;

    if (!fs.existsSync(targetFile)) {
        return false;
    }

    let content = fs.readFileSync(targetFile, 'utf8');

    // Check if the instanceOf function already exists
    if (content.includes(`export function ${functionName}`)) {
        return false;
    }

    // Extract the type definition to determine return logic
    const typeMatch = content.match(new RegExp(`export type ${typeName} = ([^;]+);`));
    if (!typeMatch) {
        return false;
    }

    const typeUnion = typeMatch[1];
    // Parse the union types to generate appropriate checks
    const types = typeUnion.split('|').map(t => t.trim());

    let instanceOfBody = '';
    if (types.length === 1) {
        // Single type, should not happen but handle it
        instanceOfBody = 'return false;';
    } else if (types.includes('string')) {
        // Union with string type - check if it's a string (but not an array)
        instanceOfBody = `if (Array.isArray(value)) return false;\n    if (typeof value === 'string') return true;\n    return false;`;
    } else {
        // For object unions, we can't reliably check without knowing the types
        // Return false to avoid breaking type narrowing
        instanceOfBody = 'return false;';
    }

    const fixedContent = content.replace(
        new RegExp(`export type ${typeName} = ([^;]+);`),
        `export type ${typeName} = $1;

export function ${functionName}(value: any): value is ${typeName} {
    ${instanceOfBody}
}`
    );

    fs.writeFileSync(targetFile, fixedContent, 'utf8');
    return true;
}

function fixFilterRequestsTypeIssue(modelsDir = generatedModelsDir) {
    // Fix type narrowing issues in Filter*RequestArgsInner files
    const filesToFix = [
        'FilterEventsRequestArgsInner',
        'FilterMarketsRequestArgsInner'
    ];

    for (const fileName of filesToFix) {
        const filePath = path.join(modelsDir, `${fileName}.ts`);
        if (!fs.existsSync(filePath)) continue;

        let content = fs.readFileSync(filePath, 'utf8');
        const originalContent = content;

        // The issue: after instanceof check fails, TypeScript loses type info
        // The problematic pattern is:
        // if (value.every(item => typeof item === 'object')) { ... return value.map(value => ...) }
        // Fix by casting value to any in the .every() and .map() calls

        // Replace: if (value.every(item => typeof item
        // With:    if ((value as any).every((item: any) => typeof item
        content = content.replace(
            /if \(value\.every\(item => typeof item/g,
            'if ((value as any).every((item: any) => typeof item'
        );

        // Replace: if (value.every(item => instanceOf
        // With:    if ((value as any).every((item: any) => instanceOf
        content = content.replace(
            /if \(value\.every\(item => instanceOf/g,
            'if ((value as any).every((item: any) => instanceOf'
        );

        // Replace: return value.map(value =>
        // With:    return (value as any).map((value: any) =>
        content = content.replace(
            /return value\.map\((\w+) =>/g,
            'return (value as any).map(($1: any) =>'
        );

        if (content !== originalContent) {
            fs.writeFileSync(filePath, content, 'utf8');
            console.log(`Fixed type narrowing in ${fileName}.ts`);
        }
    }
}

function stripGeneratedModelDocExample(content) {
    return content.replace(
        /\n## Example\n\n```typescript\n[\s\S]*?```\n\n(?=\[\[Back to top\]\])/,
        '\n'
    );
}

function stripGeneratedApiDocExamples(content) {
    return content.replace(
        /\n### Example\n\n```(?:ts|typescript)\n[\s\S]*?```\n\n(?=### Parameters)/g,
        '\n'
    );
}

function stripGeneratedReadmeUsageExample(content) {
    return content.replace(
        /\nNext, try it out\.\n\n\n```(?:ts|typescript)\n[\s\S]*?```\n+(?=## Documentation)/,
        '\n'
    );
}

function removeGeneratedModelDocExamples(docsDir = generatedDocsDir) {
    if (!fs.existsSync(docsDir)) {
        return 0;
    }

    const fileNames = fs
        .readdirSync(docsDir)
        .filter(fileName => fileName.endsWith('.md'))
        .filter(fileName => !fileName.endsWith('Api.md'));

    const changedFiles = fileNames
        .map(fileName => {
            const filePath = path.join(docsDir, fileName);
            const content = fs.readFileSync(filePath, 'utf8');
            const fixedContent = stripGeneratedModelDocExample(content);
            return { filePath, content, fixedContent };
        })
        .filter(file => file.fixedContent !== file.content);

    for (const file of changedFiles) {
        fs.writeFileSync(file.filePath, file.fixedContent, 'utf8');
    }

    return changedFiles.length;
}

function removeGeneratedApiDocExamples(docsDir = generatedDocsDir) {
    if (!fs.existsSync(docsDir)) {
        return 0;
    }

    const fileNames = fs
        .readdirSync(docsDir)
        .filter(fileName => fileName.endsWith('Api.md'));

    const changedFiles = fileNames
        .map(fileName => {
            const filePath = path.join(docsDir, fileName);
            const content = fs.readFileSync(filePath, 'utf8');
            const fixedContent = stripGeneratedApiDocExamples(content);
            return { filePath, content, fixedContent };
        })
        .filter(file => file.fixedContent !== file.content);

    for (const file of changedFiles) {
        fs.writeFileSync(file.filePath, file.fixedContent, 'utf8');
    }

    return changedFiles.length;
}

function removeGeneratedReadmeUsageExample(rootDir = generatedRootDir) {
    const readmePath = path.join(rootDir, 'README.md');
    if (!fs.existsSync(readmePath)) {
        return 0;
    }

    const content = fs.readFileSync(readmePath, 'utf8');
    const fixedContent = stripGeneratedReadmeUsageExample(content);
    if (fixedContent === content) {
        return 0;
    }

    fs.writeFileSync(readmePath, fixedContent, 'utf8');
    return 1;
}

function run() {
    console.log('Fixing generated code...');

    // Fix all OneOf files that the generator creates
    const oneOfFiles = [
        'FilterMarketsRequestArgsInnerOneOf',
        'FetchOHLCVRequestArgsInnerOneOf',
        'FetchTradesRequestArgsInnerOneOf'
    ];

    let fixed = 0;
    for (const file of oneOfFiles) {
        if (fixOneOfFile(file)) {
            console.log(`Added missing instanceOf function to ${file}.ts`);
            fixed++;
        }
    }

    fixFilterRequestsTypeIssue();

    const strippedDocExamples = removeGeneratedModelDocExamples();
    if (strippedDocExamples > 0) {
        console.log(`Removed placeholder examples from ${strippedDocExamples} generated model docs`);
    }

    const strippedApiExamples = removeGeneratedApiDocExamples();
    if (strippedApiExamples > 0) {
        console.log(`Removed placeholder examples from ${strippedApiExamples} generated API docs`);
    }

    const strippedReadmeExample = removeGeneratedReadmeUsageExample();
    if (strippedReadmeExample > 0) {
        console.log('Removed placeholder usage example from generated README');
    }

    if (fixed === 0 && !fs.existsSync(path.join(generatedModelsDir, 'FilterEventsRequestArgsInner.ts'))) {
        console.log('No files needed fixing');
    }
    console.log('Generated code fixes complete.');
}

if (require.main === module) {
    run();
}

module.exports = {
    removeGeneratedApiDocExamples,
    removeGeneratedModelDocExamples,
    removeGeneratedReadmeUsageExample,
    stripGeneratedApiDocExamples,
    stripGeneratedModelDocExample,
    stripGeneratedReadmeUsageExample,
};
