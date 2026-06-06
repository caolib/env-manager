<script setup>
import { computed } from 'vue';
import { isPathVariableName, splitPathValue } from '../utils/configDiff';
import JsonDiffView from './JsonDiffView.vue';

const props = defineProps({
    leftConfig: {
        type: Object,
        default: () => ({})
    },
    rightConfig: {
        type: Object,
        default: () => ({})
    },
    leftTitle: {
        type: String,
        default: '当前'
    },
    rightTitle: {
        type: String,
        default: '对比'
    }
});

const scopes = [
    { key: 'system', label: '系统 Path', field: 'system_vars' },
    { key: 'user', label: '用户 Path', field: 'user_vars' }
];

function normalizeEnvVars(vars) {
    return Array.isArray(vars)
        ? vars.filter(item => item && item.name).map(item => ({
            name: String(item.name),
            value: String(item.value ?? '')
        }))
        : [];
}

function mapEnvVars(vars) {
    return new Map(normalizeEnvVars(vars).map(item => [item.name.toLowerCase(), item]));
}

function getScopeVars(config, scope) {
    return config?.env_vars?.[scope.field] || [];
}

function countAdded(oldPaths, newPaths) {
    return newPaths.filter(path => !oldPaths.includes(path)).length;
}

function countRemoved(oldPaths, newPaths) {
    return oldPaths.filter(path => !newPaths.includes(path)).length;
}

const pathDiffs = computed(() => {
    return scopes.flatMap(scope => {
        const leftMap = mapEnvVars(getScopeVars(props.leftConfig, scope));
        const rightMap = mapEnvVars(getScopeVars(props.rightConfig, scope));
        const names = [...new Set([...leftMap.keys(), ...rightMap.keys()])].sort();

        return names
            .map(nameKey => {
                const leftItem = leftMap.get(nameKey);
                const rightItem = rightMap.get(nameKey);
                const displayName = rightItem?.name || leftItem?.name || nameKey;

                if (!isPathVariableName(displayName)) return null;

                const oldPaths = splitPathValue(leftItem?.value);
                const newPaths = splitPathValue(rightItem?.value);
                if (oldPaths.join('\n') === newPaths.join('\n')) return null;

                return {
                    key: `${scope.key}:${nameKey}`,
                    scope: scope.label,
                    name: displayName,
                    oldPaths,
                    newPaths,
                    leftJson: {
                        scope: scope.label,
                        name: displayName,
                        paths: oldPaths
                    },
                    rightJson: {
                        scope: scope.label,
                        name: displayName,
                        paths: newPaths
                    },
                    added: countAdded(oldPaths, newPaths),
                    removed: countRemoved(oldPaths, newPaths)
                };
            })
            .filter(Boolean);
    });
});
</script>

<template>
    <section v-if="pathDiffs.length > 0" class="path-variable-diff-view">
        <div class="path-variable-diff-heading">
            <div>
                <h4>Path 变量逐项差异</h4>
                <p>{{ leftTitle }} -> {{ rightTitle }}，按分号拆分 Path 后对比每个路径项</p>
            </div>
            <a-tag color="blue">{{ pathDiffs.length }} 个变量</a-tag>
        </div>

        <div class="path-variable-diff-list">
            <section v-for="item in pathDiffs" :key="item.key" class="path-variable-diff-section">
                <div class="path-variable-diff-section-head">
                    <div class="path-variable-diff-title">
                        <strong>{{ item.scope }}</strong>
                        <span>{{ item.name }}</span>
                        <span>{{ item.oldPaths.length }} -> {{ item.newPaths.length }} 项</span>
                    </div>

                    <div class="path-variable-diff-stats">
                        <span v-if="item.added > 0" class="path-stat-added">新增 {{ item.added }}</span>
                        <span v-if="item.removed > 0" class="path-stat-removed">删除 {{ item.removed }}</span>
                    </div>
                </div>

                <JsonDiffView :left="item.leftJson" :right="item.rightJson" :left-title="leftTitle"
                    :right-title="rightTitle" empty-text="Path 变量没有差异" />
            </section>
        </div>
    </section>
</template>

<style scoped>
.path-variable-diff-view {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
    padding: 12px;
    border: 1px solid var(--ant-color-border);
    border-radius: 8px;
    background: var(--ant-color-fill-quaternary);
}

.path-variable-diff-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
}

.path-variable-diff-heading h4 {
    margin: 0;
    font-size: 14px;
    font-weight: 700;
}

.path-variable-diff-heading p {
    margin: 4px 0 0;
    color: var(--ant-color-text-secondary);
    font-size: 12px;
}

.path-variable-diff-list {
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-width: 0;
}

.path-variable-diff-section {
    min-width: 0;
    padding: 10px;
    border: 1px solid var(--ant-color-border);
    border-radius: 6px;
    background: var(--ant-color-bg-container);
}

.path-variable-diff-section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 8px;
}

.path-variable-diff-title,
.path-variable-diff-stats {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    min-width: 0;
    color: var(--ant-color-text-secondary);
    font-size: 12px;
}

.path-variable-diff-title strong {
    color: var(--ant-color-text);
    font-size: 13px;
}

.path-stat-added {
    color: #1a7f37;
    font-weight: 600;
}

.path-stat-removed {
    color: #d1242f;
    font-weight: 600;
}

:deep(.json-diff-body) {
    max-height: 320px;
}
</style>
