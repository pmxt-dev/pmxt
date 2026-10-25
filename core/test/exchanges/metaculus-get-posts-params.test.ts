import { readFileSync } from 'fs';
import { safeLoad } from 'js-yaml';
import { metaculusApiSpec } from '../../src/exchanges/metaculus/api';

const expectedParameters = [
    { name: 'acting_user', schema: { type: 'integer' } },
    { name: 'categories', schema: { type: 'string' } },
    { name: 'include_cp_history', schema: { type: 'boolean' } },
    { name: 'include_descriptions', schema: { type: 'boolean' } },
];

function expectParameters(spec: any) {
    const parameters = spec.paths['/posts/'].get.parameters;
    for (const expected of expectedParameters) {
        expect(parameters).toEqual(expect.arrayContaining([expect.objectContaining(expected)]));
    }
}

describe('Metaculus GetPosts query parameters', () => {
    test('keeps the YAML source and generated API definition in sync', () => {
        const yaml = readFileSync(`${__dirname}/../../specs/metaculus/Metaculus.yaml`, 'utf8');
        const sourceSpec = safeLoad(yaml);

        expectParameters(sourceSpec);
        expectParameters(metaculusApiSpec);
    });
});
