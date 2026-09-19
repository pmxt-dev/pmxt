const yaml = require('js-yaml');

describe('YAML merge resource limits', () => {
  it('counts empty mappings toward the merge budget', () => {
    const source = 'empty: &empty {}\nmerged:\n  <<: [*empty, *empty, *empty]\n';

    expect(() => yaml.safeLoad(source, { maxTotalMergeKeys: 2 }))
      .toThrow(/maxTotalMergeKeys/);
  });

  it('still supports ordinary YAML merges within the budget', () => {
    const source = 'defaults: &defaults {enabled: true}\nmerged:\n  <<: *defaults\n  name: example\n';

    expect(yaml.safeLoad(source, { maxTotalMergeKeys: 10 }).merged)
      .toEqual({ enabled: true, name: 'example' });
  });
});
