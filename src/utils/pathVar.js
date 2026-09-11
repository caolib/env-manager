function isPathLikeText(text) {
    const t = String(text ?? '').trim();
    if (!t) return false;
    const cleanStr = t.replace(/^file:/, '');
    return /^[a-zA-Z]:[\\/]/.test(cleanStr)
        || /^\\\\/.test(cleanStr)
        || cleanStr.includes('\\')
        || (cleanStr.includes('/') && !cleanStr.includes('://'))
        || /%[^%]+%/.test(cleanStr);
}

function getNonEmptySegments(value) {
    return String(value ?? '')
        .split(';')
        .map(item => item.trim())
        .filter(Boolean);
}

export function isPathVarName(name) {
    return String(name ?? '').trim().toLowerCase().includes('path');
}

export function isSemicolonSeparatedValue(value) {
    const v = String(value ?? '').trim();
    if (!v || !v.includes(';')) return false;
    const segments = getNonEmptySegments(v);
    return segments.length > 1 && segments.some(isPathLikeText);
}

export function isSemicolonSeparatedVar(name, value) {
    const v = String(value ?? '').trim();
    if (!v || !v.includes(';')) return false;
    const segments = getNonEmptySegments(v);
    if (segments.length <= 1) return false;
    return isPathVarName(name) || segments.some(isPathLikeText);
}
