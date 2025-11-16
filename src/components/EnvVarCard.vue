<template>
    <a-card size="small" class="env-var-card">
        <template #title>
            <div class="card-header">
                <span class="var-name" v-html="renderName(envVar.name)"></span>
                <div class="card-actions">
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
                        </li>
                    </ul>
                </div>
                <div v-else class="path-edit-container">
                    <div class="edit-actions">
                        <a-space>
                            <a-button size="small" type="primary" @click="savePath">保存</a-button>
                            <a-button size="small" @click="cancelEditPath">取消</a-button>
                            <a-button size="small" @click="addPath">
                                <PlusOutlined />
                                添加路径
                            </a-button>
                        </a-space>
                    </div>
                    <a-alert v-if="isDirty" message="有未保存的更改" type="warning" show-icon style="margin: 8px 0;" />
                    <div class="path-edit-list">
                        <div v-for="(item, index) in editList" :key="index" class="path-edit-item">
                            <a-input v-model:value="editList[index]" placeholder="输入路径..." size="small" />
                            <a-button size="small" type="link" danger @click="removePathItem(index)">
                                <DeleteOutlined />
                            </a-button>
                        </div>
                    </div>
                </div>
            </template>
            <!-- 普通变量显示 -->
            <template v-else>
                <div class="normal-value" v-html="renderValue(envVar.value)"></div>
            </template>
        </div>
    </a-card>
</template>

<script setup>
import { EditOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons-vue';
import { computed, ref, watch } from 'vue';

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
        out += `<mark style="background-color: var(--ant-color-warning-bg); color: var(--ant-color-warning-text-active); padding: 0 2px; border-radius: 2px; font-weight: 500;">${escapeHtml(match)}</mark>`;
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

// 处理编辑按钮点击
const handleEditClick = () => {
    if (isSemicolonSeparatedValue.value) {
        startEditPath();
    } else {
        emit('edit', props.envVar);
    }
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

async function savePath() {
    const newValue = editList.value.filter(Boolean).join(';');
    emit('edit', { ...props.envVar, value: newValue });
    editingPath.value = false;
    isDirty.value = false;
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
</script>

<style scoped>
.env-var-card {
    width: fit-content;
    height: fit-content;
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
}

.card-actions {
    display: flex;
}

.var-value {
    font-size: 13px;
    word-break: break-all;
}

.normal-value {
    white-space: pre-wrap;
    padding: 8px 12px;
    border-radius: 4px;
    border: 1px solid var(--ant-color-border);
}

.path-list-container {
    cursor: pointer;
    padding: 8px 12px;
    border-radius: 4px;
    border: 1px solid var(--ant-color-border);
    transition: opacity 0.3s;
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
