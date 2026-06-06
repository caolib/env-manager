export function sortObjectKeys(value) {
    if (Array.isArray(value)) {
        return value.map(sortObjectKeys);
    }

    if (value && typeof value === 'object') {
        return Object.keys(value).sort().reduce((result, key) => {
            result[key] = sortObjectKeys(value[key]);
            return result;
        }, {});
    }

    return value;
}

export function isPathVariableName(name) {
    return String(name || '').toLowerCase() === 'path';
}

export function splitPathValue(value) {
    return String(value ?? '')
        .split(';')
        .map(item => item.trim())
        .filter(Boolean);
}

export function removePathVariablesFromConfig(config) {
    const clone = JSON.parse(JSON.stringify(config || {}));
    const envVars = clone?.env_vars;

    if (!envVars || typeof envVars !== 'object') {
        return clone;
    }

    ['system_vars', 'user_vars'].forEach(key => {
        if (!Array.isArray(envVars[key])) return;
        envVars[key] = envVars[key].filter(item => !isPathVariableName(item?.name));
    });

    return clone;
}
