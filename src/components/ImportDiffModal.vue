<script setup>
import { ref, computed, watch } from 'vue';
import {
    CheckCircleOutlined,
    CloseCircleOutlined,
    ExclamationCircleOutlined,
    ArrowRightOutlined,
    DiffOutlined
} from '@ant-design/icons-vue';

const props = defineProps({
    open: Boolean,
    currentConfig: Object,
    importConfig: Object
});

const emit = defineEmits(['update:open', 'confirm']);

const activeTab = ref('env');

// 比较环境变量
const envDiff = computed(() => {
    const changes = [];
    const currentSys = props.currentConfig?.env_vars?.system_vars || [];
    const currentUser = props.currentConfig?.env_vars?.user_vars || [];
    const importSys = props.importConfig?.env_vars?.system_vars || [];
    const importUser = props.importConfig?.env_vars?.user_vars || [];

    // 辅助函数：比较变量列表
    const compareVars = (current, imported, scope) => {
        const currentMap = new Map(current.map(v => [v.name, v.value]));
        const importMap = new Map(imported.map(v => [v.name, v.value]));

        // 检查新增和修改
        importMap.forEach((val, key) => {
            if (!currentMap.has(key)) {
                changes.push({
                    type: 'add',
                    scope,
                    name: key,
                    newValue: val
                });
            } else if (currentMap.get(key) !== val) {
                changes.push({
                    type: 'modify',
                    scope,
                    name: key,
                    oldValue: currentMap.get(key),
                    newValue: val
                });
            }
        });

        // 注意：环境变量导入逻辑通常是覆盖/新增，不删除现有变量，所以这里不统计删除
        // 除非导入逻辑改变。目前保持与 processImport 逻辑一致。
    };

    compareVars(currentSys, importSys, 'system');
    compareVars(currentUser, importUser, 'user');

    return changes;
});

// 比较变量组
const groupDiff = computed(() => {
    const changes = [];
    const currentGroups = props.currentConfig?.groups || [];
    const importGroups = props.importConfig?.groups || [];

    const currentMap = new Map(currentGroups.map(g => [g.id, g]));
    const importMap = new Map(importGroups.map(g => [g.id, g]));

    // 检查新增和修改
    importGroups.forEach(g => {
        if (!currentMap.has(g.id)) {
            // 尝试通过名字匹配（如果ID不同但名字相同，可能是同一个组的不同版本？）
            // 但这里简单起见，按ID匹配，或者按名字匹配？
            // 考虑到导入的可能是别人的配置，ID可能完全不同。
            // 策略：变量组是全量覆盖的。
            // 所以我们应该展示：导入后会变成什么样，或者对比名字。
            // 简单起见，对比名字。
        }
    });

    // 由于变量组是全量覆盖，我们直接列出差异可能比较复杂。
    // 我们可以列出：导入将包含 X 个变量组。
    // 详细对比：
    // 1. 找出 ID 相同或名字相同的组进行对比
    // 2. 标记为 新增/修改/删除

    // 简化策略：按名字对比
    const currentNames = new Map(currentGroups.map(g => [g.name, g]));
    const importNames = new Map(importGroups.map(g => [g.name, g]));

    // 新增 & 修改
    importNames.forEach((g, name) => {
        if (!currentNames.has(name)) {
            changes.push({
                type: 'add',
                name: name,
                variables: g.variables,
                schemes: g.schemes.map(s => ({
                    type: 'add',
                    name: s.name,
                    values: s.values
                }))
            });
        } else {
            const curr = currentNames.get(name);

            // 比较变量列表
            const varDiffs = [];
            const currVars = new Set(curr.variables);
            const importVars = new Set(g.variables);

            g.variables.forEach(v => {
                if (!currVars.has(v)) varDiffs.push({ type: 'add', name: v });
            });
            curr.variables.forEach(v => {
                if (!importVars.has(v)) varDiffs.push({ type: 'remove', name: v });
            });

            // 比较方案列表
            const schemeDiffs = [];
            const currSchemes = new Map(curr.schemes.map(s => [s.name, s]));
            const importSchemes = new Map(g.schemes.map(s => [s.name, s]));

            importSchemes.forEach((s, sName) => {
                if (!currSchemes.has(sName)) {
                    schemeDiffs.push({
                        type: 'add',
                        name: sName,
                        values: s.values
                    });
                } else {
                    const oldS = currSchemes.get(sName);
                    if (JSON.stringify(oldS.values) !== JSON.stringify(s.values)) {
                        schemeDiffs.push({
                            type: 'modify',
                            name: sName,
                            oldValues: oldS.values,
                            newValues: s.values
                        });
                    }
                }
            });

            currSchemes.forEach((s, sName) => {
                if (!importSchemes.has(sName)) {
                    schemeDiffs.push({
                        type: 'remove',
                        name: sName,
                        values: s.values
                    });
                }
            });

            if (schemeDiffs.length > 0 || varDiffs.length > 0) {
                changes.push({
                    type: 'modify',
                    name: name,
                    varDiffs: varDiffs,
                    schemes: schemeDiffs
                });
            } else {
                changes.push({ type: 'same', name: name });
            }
        }
    });

    // 删除 (在当前配置中有，但导入配置中没有)
    currentNames.forEach((g, name) => {
        if (!importNames.has(name)) {
            changes.push({ type: 'remove', name: name, details: '将被移除' });
        }
    });

    return changes.sort((a, b) => {
        const order = { add: 1, modify: 2, remove: 3, same: 4 };
        return order[a.type] - order[b.type];
    });
});

const handleOk = () => {
    emit('confirm');
    emit('update:open', false);
};

const handleCancel = () => {
    emit('update:open', false);
};
</script>

<template>
    <a-modal :open="open" width="100%" wrapClassName="full-modal" @ok="handleOk" @cancel="handleCancel" okText="确认导入"
        cancelText="取消">
        <a-alert message="请仔细核对以下变更" description="导入操作将覆盖同名配置。环境变量为增量更新，变量组为全量覆盖。" type="info" show-icon
            style="margin-bottom: 16px" />

        <a-tabs v-model:activeKey="activeTab">
            <a-tab-pane key="env" tab="环境变量">
                <div v-if="envDiff.length === 0" class="empty-diff">
                    <CheckCircleOutlined style="color: #52c41a; font-size: 24px; margin-bottom: 8px;" />
                    <p>环境变量没有检测到变化</p>
                </div>
                <a-table v-else :dataSource="envDiff" :pagination="false" size="small"
                    :scroll="{ y: 'calc(100vh - 300px)' }">
                    <a-table-column title="变量信息" key="info" width="200px">
                        <template #default="{ record }">
                            <div class="var-info">
                                <div class="var-name" :title="record.name">{{ record.name }}</div>
                                <div class="var-meta">
                                    <a-tag v-if="record.type === 'add'" color="green" class="mini-tag">新增</a-tag>
                                    <a-tag v-else-if="record.type === 'modify'" color="orange"
                                        class="mini-tag">修改</a-tag>
                                    <a-tag class="mini-tag">{{ record.scope === 'system' ? '系统' : '用户' }}</a-tag>
                                </div>
                            </div>
                        </template>
                    </a-table-column>
                    <a-table-column title="变更详情" key="diff">
                        <template #default="{ record }">
                            <div v-if="record.type === 'add'" class="diff-val new">{{ record.newValue }}</div>
                            <div v-else class="diff-val-group">
                                <div class="diff-val old">{{ record.oldValue }}</div>
                                <div class="diff-val new">{{ record.newValue }}</div>
                            </div>
                        </template>
                    </a-table-column>
                </a-table>
            </a-tab-pane>

            <a-tab-pane key="groups" tab="变量组">
                <div v-if="groupDiff.length === 0" class="empty-diff">
                    <p>没有变量组数据</p>
                </div>
                <a-table v-else :dataSource="groupDiff" :pagination="false" size="small"
                    :scroll="{ y: 'calc(100vh - 300px)' }">
                    <a-table-column title="变量组信息" key="info" width="200px">
                        <template #default="{ record }">
                            <div class="var-info">
                                <div class="var-name" :title="record.name">{{ record.name }}</div>
                                <div class="var-meta">
                                    <a-tag v-if="record.type === 'add'" color="green" class="mini-tag">新增</a-tag>
                                    <a-tag v-else-if="record.type === 'modify'" color="orange"
                                        class="mini-tag">更新</a-tag>
                                    <a-tag v-else-if="record.type === 'remove'" color="red" class="mini-tag">删除</a-tag>
                                    <a-tag v-else color="default" class="mini-tag">无变化</a-tag>
                                </div>
                            </div>
                        </template>
                    </a-table-column>
                    <a-table-column title="变更详情" key="details">
                        <template #default="{ record }">
                            <div class="detail-container">
                                <!-- Variables -->
                                <div v-if="record.type === 'add'" class="detail-section">
                                    <span class="detail-label">变量:</span>
                                    <div class="tag-list">
                                        <a-tag v-for="v in record.variables" :key="v" class="mini-tag">{{ v }}</a-tag>
                                    </div>
                                </div>
                                <div v-else-if="record.type === 'modify' && record.varDiffs && record.varDiffs.length > 0"
                                    class="detail-section">
                                    <span class="detail-label">变量变更:</span>
                                    <div class="tag-list">
                                        <a-tag v-for="v in record.varDiffs" :key="v.name"
                                            :color="v.type === 'add' ? 'green' : 'red'" class="mini-tag">
                                            {{ v.type === 'add' ? '+' : '-' }}{{ v.name }}
                                        </a-tag>
                                    </div>
                                </div>

                                <!-- Schemes -->
                                <div v-if="record.schemes && record.schemes.length > 0" class="detail-section">
                                    <span class="detail-label">{{ record.type === 'add' ? '方案:' : '方案变更:' }}</span>
                                    <div class="tag-list">
                                        <a-popover v-for="s in record.schemes" :key="s.name" title="方案详情"
                                            trigger="hover">
                                            <template #content>
                                                <div class="scheme-values">
                                                    <div v-if="s.type === 'modify'">
                                                        <div v-for="key in [...new Set([...Object.keys(s.oldValues || {}), ...Object.keys(s.newValues || {})])]"
                                                            :key="key" class="scheme-val-row">
                                                            <span class="scheme-key">{{ key }}:</span>
                                                            <span v-if="s.oldValues[key] !== s.newValues[key]">
                                                                <span class="diff-val old mini">{{ s.oldValues[key] ||
                                                                    '(空)' }}</span>
                                                                <ArrowRightOutlined
                                                                    style="font-size: 10px; margin: 0 4px;" />
                                                                <span class="diff-val new mini">{{ s.newValues[key] ||
                                                                    '(空)' }}</span>
                                                            </span>
                                                            <span v-else class="scheme-val">{{ s.newValues[key]
                                                            }}</span>
                                                        </div>
                                                    </div>
                                                    <div v-else>
                                                        <div v-for="(val, key) in s.values" :key="key"
                                                            class="scheme-val-row">
                                                            <span class="scheme-key">{{ key }}:</span>
                                                            <span class="scheme-val">{{ val }}</span>
                                                        </div>
                                                        <div v-if="!s.values || Object.keys(s.values).length === 0"
                                                            style="color: #999;">(无变量值)</div>
                                                    </div>
                                                </div>
                                            </template>
                                            <a-tag
                                                :color="s.type === 'add' ? 'green' : (s.type === 'remove' ? 'red' : 'orange')"
                                                class="mini-tag" style="cursor: pointer;">
                                                {{ s.type === 'add' ? '+' : (s.type === 'remove' ? '-' : 'M') }} {{
                                                    s.name }}
                                            </a-tag>
                                        </a-popover>
                                    </div>
                                </div>

                                <div v-if="record.type === 'same'" style="color: #999; font-size: 12px;">
                                    配置无变化
                                </div>
                                <div v-if="record.type === 'remove'" style="color: #999; font-size: 12px;">
                                    该变量组将被移除
                                </div>
                            </div>
                        </template>
                    </a-table-column>
                </a-table>
            </a-tab-pane>
        </a-tabs>
    </a-modal>
</template>

<style scoped>
.empty-diff {
    text-align: center;
    padding: 40px;
    color: #999;
}

.diff-val {
    font-family: monospace;
    word-break: break-all;
    padding: 2px 4px;
    border-radius: 2px;
    font-size: 12px;
}

.diff-val.new {
    background-color: rgba(82, 196, 26, 0.1);
    border: 1px solid rgba(82, 196, 26, 0.4);
    color: #52c41a;
}

.diff-val.old {
    background-color: rgba(255, 77, 79, 0.1);
    border: 1px solid rgba(255, 77, 79, 0.4);
    color: #ff4d4f;
    text-decoration: line-through;
}

.diff-val-group {
    display: flex;
    flex-direction: column;
}

.var-info {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.var-name {
    font-weight: 600;
    word-break: break-all;
    font-size: 13px;
}

.var-meta {
    display: flex;
    gap: 4px;
}

.mini-tag {
    margin-right: 0 !important;
    font-size: 12px;
    line-height: 18px;
    padding: 0 4px;
}

.scheme-diff-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.scheme-item {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
}

.scheme-name {
    color: var(--ant-text-color);
}

.detail-container {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.detail-section {
    display: flex;
    align-items: flex-start;
    gap: 4px;
}

.detail-label {
    font-size: 12px;
    color: #999;
    white-space: nowrap;
    margin-top: 2px;
}

.tag-list {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
}

.scheme-values {
    max-height: 300px;
    overflow-y: auto;
    max-width: 400px;
}

.scheme-val-row {
    font-size: 12px;
    margin-bottom: 4px;
    border-bottom: 1px dashed #eee;
    padding-bottom: 2px;
    display: flex;
    align-items: flex-start;
}

.scheme-key {
    font-weight: bold;
    color: #666;
    margin-right: 4px;
    min-width: 80px;
    flex-shrink: 0;
}

.scheme-val {
    font-family: monospace;
    word-break: break-all;
}

.diff-val.mini {
    padding: 0 2px;
    font-size: 11px;
}
</style>

<style>
.full-modal {
    top: 0;
    padding-bottom: 0;
    margin: 0;
}

.full-modal .ant-modal {
    top: 0;
    padding-bottom: 0;
    margin: 0;
    height: 100vh;
    max-width: 100%;
}

.full-modal .ant-modal-content {
    height: 100vh;
    display: flex;
    flex-direction: column;
    border-radius: 0;
}

.full-modal .ant-modal-body {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
}

.full-modal .ant-tabs {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.full-modal .ant-tabs-content {
    flex: 1;
    overflow: hidden;
    height: 100%;
}

.full-modal .ant-tabs-tabpane {
    height: 100%;
    overflow: hidden;
    display: flex;
    flex-direction: column;
}
</style>