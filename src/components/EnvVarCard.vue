<template>
    <a-card size="small" class="env-var-card" :class="{ 'path-card': isSemicolonSeparatedValue }">
        <template #title>
            <div class="card-header">
                <span class="var-name clickable" v-html="renderName(envVar.name)" @click="copyKey"
                    title="点击复制变量名"></span>
                <div class="card-actions">
                    <a-button v-if="isSensitiveField" size="small" type="link" @click="showFullValue = !showFullValue"
                        :title="showFullValue ? '隐藏值' : '显示完整值'">
                        <EyeOutlined v-if="showFullValue" />
                        <EyeInvisibleOutlined v-else />
                    </a-button>
                    <a-button size="small" type="link" @click="copyAll" title="复制 KEY=VALUE">
                        <CopyOutlined />
                    </a-button>
                    <a-tooltip v-if="isReadonly" title="需要管理员权限才能编辑系统环境变量">
                        <a-button size="small" type="link" :disabled="isReadonly">
                            <EditOutlined />
                        </a-button>
                    </a-tooltip>
                    <a-button v-else size="small" type="link" @click="handleEditClick">
                        <EditOutlined />
                    </a-button>
                    <a-tooltip v-if="isReadonly" title="需要管理员权限才能删除系统环境变量">
                        <a-button size="small" type="link" danger :disabled="isReadonly">
                            <DeleteOutlined />
                        </a-button>
                    </a-tooltip>
                    <a-popconfirm v-else title="确定要删除该变量吗？" ok-text="确定" cancel-text="取消"
                        @confirm="$emit('delete', envVar)">
                        <a-button size="small" type="link" danger>
                            <DeleteOutlined />
                        </a-button>
                    </a-popconfirm>
                </div>
            </div>
        </template>

        <div class="var-value">
            <!-- Path 变量的分号分隔显示 -->
            <template v-if="isSemicolonSeparatedValue">
                <div v-if="!editingPath" class="path-list-container" @click="startEditPath">
                    <ul class="path-list">
                        <li v-for="(item, idx) in pathList" :key="idx" class="path-item">
                            <span v-html="renderPathItem(item)"></span>
                            <span v-if="pathCheckResults[item] === false" class="path-status path-not-exist"
                                title="路径不存在">✗</span>
                            <span v-else-if="pathCheckResults[item] === true" class="path-status path-exist"
                                title="路径存在">✓</span>
                        </li>
                    </ul>
                </div>
                <div v-else class="path-edit-container">
                    <div class="edit-actions">
                        <a-space>
                            <a-button size="small" type="primary" @click="savePath">保存</a-button>
                            <a-button size="small" @click="cancelEditPath">取消</a-button>
                            <a-button size="small" @click="removeDuplicates">去重</a-button>
                            <a-button size="small" @click="addPath">
                                <PlusOutlined />
                                添加路径
                            </a-button>
                        </a-space>
                    </div>
                    <a-alert v-if="isDirty" message="有未保存的更改" type="warning" show-icon style="margin: 8px 0;" />
                    <div class="path-edit-list">
                        <div v-for="(item, index) in editList" :key="index" class="path-edit-item">
                            <a-input v-model:value="editList[index]" style="width: 800px" placeholder="输入路径..."
                                size="small" />
                            <a-button size="small" type="link" danger @click="removePathItem(index)">
                                <DeleteOutlined />
                            </a-button>
                        </div>
                    </div>
                </div>
            </template>
            <!-- 普通变量显示 -->
            <template v-else>
                <div class="normal-value-wrapper">
                    <div class="normal-value clickable" v-html="renderValue(displayValue)" @click="copyValue"
                        title="点击复制变量值"></div>
                    <span v-if="normalPathCheckResult === false" class="path-status path-not-exist"
                        title="路径不存在">✗</span>
                    <span v-else-if="normalPathCheckResult === true" class="path-status path-exist"
                        title="路径存在">✓</span>
                </div>
            </template>
        </div>
    </a-card>
</template>

<script setup>
import { EditOutlined, DeleteOutlined, PlusOutlined, CopyOutlined, EyeOutlined, EyeInvisibleOutlined } from '@ant-design/icons-vue';
import { computed, ref, watch } from 'vue';
import { message, Modal } from 'ant-design-vue';
import { h } from 'vue';

// 工具函数：HTML 转义
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// 工具函数：高亮关键词
function highlightHtml(text, keyword) {
    if (!text) return '';
    if (!keyword) return escapeHtml(text);
    const src = String(text);
    const k = String(keyword);
    const srcLower = src.toLowerCase();
    const kLower = k.toLowerCase();
    let i = 0;
    let from = 0;
    let out = '';
    while ((i = srcLower.indexOf(kLower, from)) !== -1) {
        out += escapeHtml(src.slice(from, i));
        const match = src.slice(i, i + k.length);
        out += `<mark style="background-color: yellow; color: red; padding: 0; ">${escapeHtml(match)}</mark>`;
        from = i + k.length;
    }
    out += escapeHtml(src.slice(from));
    return out;
}

const props = defineProps({
    envVar: {
        type: Object,
        required: true
    },
    highlight: {
        type: String,
        default: ''
    },
    isReadonly: {
        type: Boolean,
        default: false
    },
    sensitiveFieldsEnabled: {
        type: Boolean,
        default: true
    },
    sensitiveKeywords: {
        type: Array,
        default: () => ['key', 'token', 'password', 'secret', 'credential', 'auth', 'apikey', 'api_key']
    }
});

const emit = defineEmits(['edit', 'delete']);

// 渲染函数 - 默认搜索全部(变量名和值)
function renderName(name) {
    return props.highlight ? highlightHtml(name, props.highlight) : escapeHtml(name);
}

function renderValue(value) {
    return props.highlight ? highlightHtml(value, props.highlight) : escapeHtml(value);
}

function renderPathItem(item) {
    return props.highlight ? highlightHtml(item, props.highlight) : escapeHtml(item);
}

// Path 变量相关
const pathList = computed(() => {
    if (isSemicolonSeparatedValue.value) {
        return props.envVar.value.split(';').filter(Boolean);
    }
    return [];
});

// 检查是否为分号分隔的值
const isSemicolonSeparatedValue = computed(() => {
    const value = props.envVar.value?.trim();
    if (!value) return false;
    return value.includes(';') && value.split(';').filter(Boolean).length > 1;
});

// Path 编辑相关
const editingPath = ref(false);
const editList = ref([]);
const isDirty = ref(false);

// 敏感信息相关
const showFullValue = ref(false);

// 检查变量是否为敏感字段
const isSensitiveField = computed(() => {
    if (!props.sensitiveFieldsEnabled) return false;
    const varNameLower = props.envVar.name.toLowerCase();
    return props.sensitiveKeywords.some(keyword => varNameLower.includes(keyword.toLowerCase()));
});

// 获取显示的值
const displayValue = computed(() => {
    if (!isSensitiveField.value || showFullValue.value) {
        return props.envVar.value;
    }
    // 隐藏敏感信息：显示前 1/2，后面用省略号
    const value = props.envVar.value || '';
    if (value.length <= 10) {
        return value;
    }
    const visibleLength = Math.ceil(value.length / 2);
    return value.substring(0, visibleLength) + '...';
});

// 路径检测结果缓存
const pathCheckResults = ref({});
const normalPathCheckResult = ref(null);

// 处理编辑按钮点击
const handleEditClick = () => {
    if (isSemicolonSeparatedValue.value) {
        startEditPath();
    } else {
        emit('edit', props.envVar);
    }
};

// 复制完整的 KEY=VALUE
const copyAll = () => {
    const textToCopy = `${props.envVar.name}=${props.envVar.value}`;
    navigator.clipboard.writeText(textToCopy).then(() => {
        message.success('已复制键值对到剪贴板');
    }).catch(() => {
        message.error('复制失败');
    });
};

// 复制变量名
const copyKey = () => {
    navigator.clipboard.writeText(props.envVar.name).then(() => {
        message.success('已复制变量名到剪贴板');
    }).catch(() => {
        message.error('复制失败');
    });
};

// 复制变量值
const copyValue = () => {
    navigator.clipboard.writeText(props.envVar.value).then(() => {
        message.success('已复制变量值到剪贴板');
    }).catch(() => {
        message.error('复制失败');
    });
};

function startEditPath() {
    editList.value = [...pathList.value];
    editingPath.value = true;
    isDirty.value = false;
}

function cancelEditPath() {
    editingPath.value = false;
    editList.value = [];
    isDirty.value = false;
}

function addPath() {
    editList.value.push('');
    isDirty.value = true;
}

// 保存并显示 diff 确认
async function savePath() {
    const oldPaths = pathList.value;
    const newPaths = editList.value.filter(Boolean);

    // 计算差异
    const removed = oldPaths.filter(p => !newPaths.includes(p));
    const added = newPaths.filter(p => !oldPaths.includes(p));
    const unchanged = newPaths.filter(p => oldPaths.includes(p));

    // 显示对比并确认
    Modal.confirm({
        title: '确认保存修改',
        width: '100%',
        wrapClassName: 'full-screen-modal',
        style: { top: 0, paddingBottom: 0, maxWidth: '100%' },
        bodyStyle: { height: 'calc(100vh - 110px)', overflowY: 'auto' },
        content: h('div', { style: { height: '100%' } }, [
            h('div', { style: { display: 'flex', gap: '20px', height: '100%' } }, [
                // 修改前
                h('div', { style: { flex: 1, display: 'flex', flexDirection: 'column' } }, [
                    h('h4', { style: { marginBottom: '8px', color: '#666' } }, '修改前:'),
                    h('div', {
                        style: {
                            flex: 1,
                            border: '1px solid #d9d9d9',
                            borderRadius: '4px',
                            padding: '12px',
                            backgroundColor: '#fafafa',
                            overflowY: 'auto'
                        }
                    }, [
                        h('ul', { style: { margin: 0, paddingLeft: '20px', listStyle: 'disc' } },
                            oldPaths.map(path =>
                                h('li', {
                                    style: {
                                        marginBottom: '4px',
                                        color: removed.includes(path) ? '#ff4d4f' : '#000',
                                        textDecoration: removed.includes(path) ? 'line-through' : 'none',
                                        opacity: removed.includes(path) ? 0.6 : 1
                                    }
                                }, path)
                            )
                        )
                    ])
                ]),
                // 修改后
                h('div', { style: { flex: 1, display: 'flex', flexDirection: 'column' } }, [
                    h('h4', { style: { marginBottom: '8px', color: '#666' } }, '修改后:'),
                    h('div', {
                        style: {
                            flex: 1,
                            border: '1px solid #d9d9d9',
                            borderRadius: '4px',
                            padding: '12px',
                            backgroundColor: '#fafafa',
                            overflowY: 'auto'
                        }
                    }, [
                        h('ul', { style: { margin: 0, paddingLeft: '20px', listStyle: 'disc' } },
                            newPaths.map(path =>
                                h('li', {
                                    style: {
                                        marginBottom: '4px',
                                        color: added.includes(path) ? '#52c41a' : '#000',
                                        fontWeight: added.includes(path) ? 'bold' : 'normal',
                                        backgroundColor: added.includes(path) ? '#f6ffed' : 'transparent',
                                        padding: added.includes(path) ? '2px 4px' : '0',
                                        borderRadius: '2px'
                                    }
                                }, path)
                            )
                        )
                    ])
                ])
            ]),
            // 统计信息
            (added.length > 0 || removed.length > 0) ? h('div', {
                style: {
                    marginTop: '16px',
                    padding: '8px 12px',
                    backgroundColor: '#e6f7ff',
                    borderRadius: '4px',
                    fontSize: '13px'
                }
            }, [
                added.length > 0 ? h('div', { style: { color: '#52c41a' } }, `✓ 新增 ${added.length} 项`) : null,
                removed.length > 0 ? h('div', { style: { color: '#ff4d4f' } }, `✗ 删除 ${removed.length} 项`) : null,
                h('div', { style: { color: '#666' } }, `= 保持 ${unchanged.length} 项不变`)
            ]) : null
        ]),
        okText: '确认保存',
        cancelText: '取消',
        onOk() {
            const finalValue = newPaths.join(';');
            emit('edit', { ...props.envVar, value: finalValue });
            editingPath.value = false;
            isDirty.value = false;
        }
    });
}

function removePathItem(index) {
    editList.value.splice(index, 1);
    isDirty.value = true;
}

// 监听外部 Path 变化
watch(() => props.envVar.value, () => {
    if (editingPath.value) {
        editingPath.value = false;
        isDirty.value = false;
    }
});

// 监听 editList 变化
watch(editList, (newVal) => {
    if (!editingPath.value) return;
    isDirty.value = newVal.join(';') !== pathList.value.join(';');
}, { deep: true });

// 判断是否可以检测路径
const canCheckPath = computed(() => {
    if (isSemicolonSeparatedValue.value) {
        // Path 变量,检查是否有路径格式的项
        return pathList.value.some(item => window.services?.isPathLike(item));
    } else {
        // 普通变量,检查是否为路径格式
        const value = props.envVar.value?.trim();
        return value && window.services?.isPathLike(value);
    }
});

// 检查路径
function checkPaths() {
    if (isSemicolonSeparatedValue.value) {
        // 检测 Path 变量
        const results = {};
        let existCount = 0;
        let notExistCount = 0;
        let notPathCount = 0;
        const notExistPaths = [];

        for (const item of pathList.value) {
            if (window.services?.isPathLike(item)) {
                const exists = window.services.checkPathExists(item);
                results[item] = exists;
                if (exists) {
                    existCount++;
                } else {
                    notExistCount++;
                    notExistPaths.push(item);
                }
            } else {
                notPathCount++;
            }
        }

        pathCheckResults.value = results;

        // 显示结果
        Modal.info({
            title: '路径检测结果',
            width: 600,
            content: h('div', {}, [
                h('p', { style: { marginBottom: '8px' } }, `变量名: ${props.envVar.name}`),
                h('p', { style: { marginBottom: '8px' } }, `总计: ${pathList.value.length} 项`),
                h('p', { style: { marginBottom: '8px', color: '#52c41a' } }, `✓ 存在: ${existCount} 项`),
                h('p', { style: { marginBottom: '8px', color: '#ff4d4f' } }, `✗ 不存在: ${notExistCount} 项`),
                notPathCount > 0 ? h('p', { style: { marginBottom: '8px', color: '#999' } }, `非路径格式: ${notPathCount} 项`) : null,
                notExistPaths.length > 0 ? h('div', { style: { marginTop: '16px' } }, [
                    h('h4', { style: { marginBottom: '8px' } }, '不存在的路径:'),
                    h('ul', { style: { margin: 0, paddingLeft: '20px', maxHeight: '200px', overflowY: 'auto' } },
                        notExistPaths.map(p => h('li', { style: { marginBottom: '4px', fontSize: '12px', wordBreak: 'break-all' } }, p))
                    )
                ]) : null
            ])
        });
    } else {
        // 检测普通变量
        const value = props.envVar.value?.trim();
        if (value && window.services?.isPathLike(value)) {
            const exists = window.services.checkPathExists(value);
            normalPathCheckResult.value = exists;

            Modal.info({
                title: '路径检测结果',
                width: 600,
                content: h('div', {}, [
                    h('p', { style: { marginBottom: '8px' } }, `变量名: ${props.envVar.name}`),
                    h('p', { style: { marginBottom: '8px' } }, `路径: ${value}`),
                    h('p', {
                        style: {
                            marginBottom: '8px',
                            color: exists ? '#52c41a' : '#ff4d4f',
                            fontWeight: 'bold'
                        }
                    }, exists ? '✓ 路径存在' : '✗ 路径不存在')
                ])
            });
        }
    }
}

// 检查路径状态(仅用于内部逻辑)
function checkPathStatus(pathStr) {
    if (!window.services?.isPathLike(pathStr)) {
        return null; // 不是路径格式
    }
    return window.services.checkPathExists(pathStr);
}

// 普通变量的路径状态(已废弃,保留用于兼容)
const normalPathStatus = computed(() => {
    return normalPathCheckResult.value;
});

// Path 去重
function removeDuplicates() {
    const seen = new Set();
    const unique = [];

    for (const item of editList.value) {
        const normalized = item.trim().toLowerCase();
        if (normalized && !seen.has(normalized)) {
            seen.add(normalized);
            unique.push(item.trim());
        }
    }

    const removedCount = editList.value.length - unique.length;
    editList.value = unique;

    if (removedCount > 0) {
        message.success(`已去除 ${removedCount} 个重复项`);
        isDirty.value = true;
    } else {
        message.info('没有发现重复项');
    }
}
</script>

<style scoped>
.env-var-card {
    width: fit-content;
    height: fit-content;
    border: 2px solid var(--blue);
}

:deep(.ant-card-head) {
    padding-right: 0;
}

.card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.var-name {
    font-weight: 600;
    font-size: 14px;
    word-break: break-word;
    margin-right: 10px;
}

.path-card .var-name {
    color: green;
}

.clickable {
    cursor: pointer;
    transition: all 0.2s;
    user-select: none;
}

.clickable:hover {
    opacity: 0.7;
    background-color: rgba(0, 0, 0, 0.02);
    border-radius: 2px;
}

.clickable:active {
    opacity: 0.5;
}

.card-actions {
    display: flex;
    gap: 4px;
    padding: 4px 8px;
    background-color: rgba(0, 0, 0, 0.03);
    border-radius: 4px;
}

.var-value {
    font-size: 13px;
    word-break: break-all;
}

.normal-value {
    white-space: pre-wrap;
    padding: 0;
    border-radius: 4px;
    border: 1px solid var(--ant-color-border);
}

.path-list-container {
    cursor: pointer;
    padding: 8px 12px;
    border-radius: 4px;
    border: 1px solid var(--ant-color-border);
    transition: opacity 0.3s;
    max-height: 500px;
    overflow-y: auto;
}

.path-list-container:hover {
    opacity: 0.8;
}

.path-list {
    list-style: none;
    padding-left: 0;
    margin: 0;
}

.path-item {
    padding: 2px 0;
    font-size: 12px;
    line-height: 1.5;
    display: flex;
    align-items: center;
    gap: 8px;
}

.path-status {
    font-size: 14px;
    font-weight: bold;
    flex-shrink: 0;
}

.path-exist {
    color: #52c41a;
}

.path-not-exist {
    color: #ff4d4f;
}

.normal-value-wrapper {
    display: flex;
    align-items: center;
    gap: 8px;
}

.path-edit-container {
    padding: 12px;
    border-radius: 4px;
    border: 1px solid var(--ant-color-border);
}

.edit-actions {
    margin-bottom: 12px;
}

.path-edit-list {
    max-height: 300px;
    overflow-y: auto;
}

.path-edit-item {
    display: flex;
    gap: 8px;
    margin-bottom: 8px;
    align-items: center;
}

.path-edit-item :deep(.ant-input) {
    flex: 1;
}
</style>

<!-- 全屏模态框样式 -->
<style>
.full-screen-modal .ant-modal {
    max-width: 100%;
    top: 0;
    padding-bottom: 0;
    margin: 0;
}

.full-screen-modal .ant-modal-content {
    display: flex;
    flex-direction: column;
    height: 100vh;
}

.full-screen-modal .ant-modal-body {
    flex: 1;
    overflow-y: auto;
}
</style>
