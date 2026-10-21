<template>
    <a-card size="small" class="env-var-card" :class="{
        'path-card': isSemicolonSeparatedValue,
        'disabled-card': props.disabled || props.envVar.disabled
    }" @contextmenu="openContextMenu">
        <template #title>
            <div class="card-header">
                <span class="var-name clickable" :class="{ 'disabled-text': props.disabled || props.envVar.disabled }"
                    @click="copyKey" title="点击复制变量名">
                    <HighlightText :text="envVar.name" :keyword="props.highlight" />
                </span>
                <a-tag v-if="props.disabled || props.envVar.disabled" color="default" style="margin-left: 8px;">
                    禁用
                </a-tag>
            </div>
        </template>

        <div class="var-value">
            <!-- Path 变量的分号分隔显示 -->
            <template v-if="isSemicolonSeparatedValue">
                <div v-if="!editingPath" class="path-list-container" @click="startEditPath">
                    <ul class="path-list">
                        <li v-for="(item, idx) in pathList" :key="idx" class="path-item">
                            <span>
                                <HighlightText :text="item" :keyword="props.highlight" />
                            </span>
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
                            <a-button size="small" @click="checkEditPaths">路径检测</a-button>
                            <a-button v-if="isDirty" size="small" @click="showDiff">diff</a-button>
                            <a-button size="small" @click="addPath">
                                <PlusOutlined />
                                添加路径
                            </a-button>
                        </a-space>
                    </div>
                    <a-alert v-if="isDirty" message="有未保存的更改" type="warning" show-icon style="margin: 8px 0;" />
                    <div class="path-edit-list">
                        <div v-for="(item, index) in editList" :key="index" class="path-edit-item">
                            <div style="position: relative; flex: 1; min-width: 0;">
                                <a-input v-model:value="editList[index]" style="width: 100%" placeholder="输入路径..."
                                    size="small" />
                            </div>
                            <a-button size="small" type="link" @click="insertPathAfter(index)" title="在下方插入路径">
                                <PlusOutlined />
                            </a-button>
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
                    <div class="normal-value clickable" @click="copyValue" title="点击复制变量值">
                        <HighlightText :text="displayValue" :keyword="props.highlight" />
                    </div>
                    <span v-if="normalPathCheckResult === false" class="path-status path-not-exist"
                        title="路径不存在">✗</span>
                    <span v-else-if="normalPathCheckResult === true" class="path-status path-exist"
                        title="路径存在">✓</span>
                </div>
            </template>
        </div>
    </a-card>

    <Teleport to="body">
        <div v-if="contextMenu.visible" ref="contextMenuRef" class="env-card-context-menu"
            :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }" @click.stop @contextmenu.prevent>
            <button v-for="item in contextMenuItems" :key="item.action" type="button" class="context-menu-item"
                :class="{ danger: item.danger }" @click="runContextMenuAction(item.action)">
                <component :is="item.icon" class="context-menu-icon" />
                <span>{{ item.label }}</span>
            </button>
        </div>
    </Teleport>
</template>

<script>
let activeContextMenuCloser = null;
</script>

<script setup>
import { EditOutlined, DeleteOutlined, PlusOutlined, CopyOutlined, EyeOutlined, EyeInvisibleOutlined, FolderOpenOutlined, LinkOutlined } from '@ant-design/icons-vue';
import { computed, defineComponent, h, ref, watch, provide, inject, nextTick, onBeforeUnmount } from 'vue';
import { Checkbox, message, Modal } from '../ui';
import PathDiffModal from './PathDiffModal.vue';
import HighlightText from './HighlightText.vue';
import { isSemicolonSeparatedVar } from '../utils/pathVar';

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
    },
    disabled: {
        type: Boolean,
        default: false
    }
});

const emit = defineEmits(['edit', 'delete', 'saveDirect']);

// 注入主题模式，供 PathDiffModal 使用
const themeMode = inject('themeMode', 'light');
provide('themeMode', themeMode);

// Path 变量相关
const pathList = computed(() => {
    if (isSemicolonSeparatedValue.value) {
        return props.envVar.value.split(';').filter(Boolean);
    }
    return [];
});

// 检查是否为分号分隔的值
const isSemicolonSeparatedValue = computed(() => {
    return isSemicolonSeparatedVar(props.envVar.name, props.envVar.value);
});

// Path 编辑相关
const editingPath = ref(false);
const editList = ref([]);
const isDirty = ref(false);

// 敏感信息相关
const showFullValue = ref(false);
const contextMenuRef = ref(null);
const contextMenu = ref({
    visible: false,
    x: 0,
    y: 0
});

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

// 判断当前值是否为有效的文件或文件夹路径
const isValidPath = computed(() => {
    const value = props.envVar.value?.trim();
    if (!value) return false;

    // 对于分号分隔的值（PATH变量），不显示打开按钮
    if (isSemicolonSeparatedValue.value) return false;

    // 检查是否为路径格式
    if (!window.services?.isPathLike(value)) return false;

    // 检查路径是否存在
    return window.services.checkPathExists(value);
});

// 判断当前值是否为有效的 URL
const isValidURL = computed(() => {
    const value = props.envVar.value?.trim();
    if (!value) return false;

    // 对于分号分隔的值，不显示打开按钮
    if (isSemicolonSeparatedValue.value) return false;

    // 检查是否为有效的 URL
    return window.services?.isURL(value);
});

const contextMenuItems = computed(() => {
    const items = [];

    if (isSensitiveField.value) {
        items.push({
            action: 'toggleSensitive',
            label: showFullValue.value ? '隐藏完整值' : '显示完整值',
            icon: showFullValue.value ? EyeInvisibleOutlined : EyeOutlined
        });
    }

    if (isValidPath.value) {
        items.push({
            action: 'openPath',
            label: '打开',
            icon: FolderOpenOutlined
        });
    }

    if (isValidURL.value) {
        items.push({
            action: 'openURL',
            label: '在浏览器中打开',
            icon: LinkOutlined
        });
    }

    items.push(
        {
            action: 'copyAll',
            label: '复制',
            icon: CopyOutlined
        },
        {
            action: 'edit',
            label: '编辑',
            icon: EditOutlined
        }
    );

    if (!isSemicolonSeparatedValue.value) {
        items.push({
            action: 'delete',
            label: '删除',
            icon: DeleteOutlined,
            danger: true
        });
    }

    return items;
});

function isNativeContextMenuTarget(target) {
    return typeof target?.closest === 'function'
        && !!target.closest('input, textarea, [contenteditable="true"]');
}

function openContextMenu(event) {
    if (isNativeContextMenuTarget(event.target)) return;

    event.preventDefault();
    event.stopPropagation();

    if (activeContextMenuCloser && activeContextMenuCloser !== hideContextMenu) {
        activeContextMenuCloser();
    }

    contextMenu.value = {
        visible: true,
        x: event.clientX,
        y: event.clientY
    };
    activeContextMenuCloser = hideContextMenu;

    nextTick(() => {
        placeContextMenu(event.clientX, event.clientY);
        bindContextMenuListeners();
    });
}

function placeContextMenu(clientX, clientY) {
    const margin = 8;
    const menu = contextMenuRef.value;
    const width = menu?.offsetWidth || 180;
    const height = menu?.offsetHeight || 240;
    const maxX = Math.max(margin, window.innerWidth - width - margin);
    const maxY = Math.max(margin, window.innerHeight - height - margin);

    contextMenu.value.x = Math.min(Math.max(clientX, margin), maxX);
    contextMenu.value.y = Math.min(Math.max(clientY, margin), maxY);
}

function hideContextMenu() {
    contextMenu.value.visible = false;
    if (activeContextMenuCloser === hideContextMenu) {
        activeContextMenuCloser = null;
    }
    unbindContextMenuListeners();
}

function handleContextMenuKeydown(event) {
    if (event.key === 'Escape') {
        hideContextMenu();
    }
}

function bindContextMenuListeners() {
    unbindContextMenuListeners();
    window.document.addEventListener('click', hideContextMenu);
    window.document.addEventListener('keydown', handleContextMenuKeydown);
    window.addEventListener('resize', hideContextMenu);
    window.addEventListener('scroll', hideContextMenu, true);
}

function unbindContextMenuListeners() {
    window.document.removeEventListener('click', hideContextMenu);
    window.document.removeEventListener('keydown', handleContextMenuKeydown);
    window.removeEventListener('resize', hideContextMenu);
    window.removeEventListener('scroll', hideContextMenu, true);
}

function runContextMenuAction(action) {
    hideContextMenu();

    if (action === 'toggleSensitive') {
        showFullValue.value = !showFullValue.value;
    } else if (action === 'openPath') {
        openPath();
    } else if (action === 'openURL') {
        openURL();
    } else if (action === 'copyAll') {
        copyAll();
    } else if (action === 'edit') {
        handleEditClick();
    } else if (action === 'delete') {
        emit('delete', props.envVar);
    }
}

onBeforeUnmount(() => {
    hideContextMenu();
});

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

// 打开文件或文件夹
const openPath = () => {
    try {
        const value = props.envVar.value?.trim();
        if (!value) return;

        window.services.shellOpenPath(value);
        message.success('已打开');
    } catch (error) {
        message.error(error.message || '打开失败');
    }
};

// 打开 URL
const openURL = () => {
    try {
        const value = props.envVar.value?.trim();
        if (!value) return;

        window.services.openURL(value);
        message.success('已在浏览器中打开');
    } catch (error) {
        message.error(error.message || '打开链接失败');
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

// 直接保存
function savePath() {
    const newPaths = editList.value.filter(Boolean);
    const finalValue = newPaths.join(';');
    emit('saveDirect', { ...props.envVar, value: finalValue });
    editingPath.value = false;
    isDirty.value = false;
}

// 显示 diff 确认后保存
async function showDiff() {
    const oldPaths = pathList.value;
    const newPaths = editList.value.filter(Boolean);

    // 显示对比并确认
    Modal.confirm({
        title: '确认保存修改',
        width: '100%',
        wrapClassName: 'full-screen-modal',
        style: { top: 0, paddingBottom: 0, maxWidth: '100%' },
        bodyStyle: { height: 'calc(100vh - 110px)', overflowY: 'auto' },
        content: h(PathDiffModal, { oldPaths, newPaths }),
        okText: '确认保存',
        cancelText: '取消',
        onOk() {
            const finalValue = newPaths.join(';');
            emit('saveDirect', { ...props.envVar, value: finalValue });
            editingPath.value = false;
            isDirty.value = false;
        }
    });
}

function removePathItem(index) {
    editList.value.splice(index, 1);
    isDirty.value = true;
}

function insertPathAfter(index) {
    editList.value.splice(index + 1, 0, '');
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

function removeDuplicateEditPaths() {
    const seen = new Set();
    const unique = [];
    let removedCount = 0;

    for (const item of editList.value) {
        const normalized = item.trim().toLowerCase();
        if (!normalized) {
            unique.push(item);
        } else if (!seen.has(normalized)) {
            seen.add(normalized);
            unique.push(item.trim());
        } else {
            removedCount++;
        }
    }

    if (removedCount > 0) {
        editList.value = unique;
    }

    return removedCount;
}

function showMissingPathCleanupModal(missingPaths, duplicateRemovedCount) {
    const selectedIndexes = ref(missingPaths.map(item => item.index));

    const MissingPathCleanupContent = defineComponent({
        name: 'MissingPathCleanupContent',
        setup() {
            const allSelected = computed(() => selectedIndexes.value.length === missingPaths.length);
            const indeterminate = computed(() => selectedIndexes.value.length > 0 && selectedIndexes.value.length < missingPaths.length);

            function toggleAll(event) {
                selectedIndexes.value = event.target.checked ? missingPaths.map(item => item.index) : [];
            }

            function toggleOne(index, checked) {
                if (checked) {
                    selectedIndexes.value = selectedIndexes.value.includes(index)
                        ? selectedIndexes.value
                        : [...selectedIndexes.value, index];
                } else {
                    selectedIndexes.value = selectedIndexes.value.filter(item => item !== index);
                }
            }

            return () => h('div', {}, [
                h('p', { style: { marginBottom: '8px' } }, `变量名: ${props.envVar.name}`),
                duplicateRemovedCount > 0
                    ? h('p', { style: { marginBottom: '8px', color: 'var(--ui-primary)' } }, `已自动删除重复路径: ${duplicateRemovedCount} 项`)
                    : null,
                h('p', { style: { marginBottom: '12px', color: 'var(--ui-danger)', fontWeight: 'bold' } }, `发现不存在路径: ${missingPaths.length} 项`),
                h('div', { style: { marginBottom: '8px' } }, [
                    h(Checkbox, {
                        checked: allSelected.value,
                        indeterminate: indeterminate.value,
                        onChange: toggleAll
                    }, () => `全选 (${selectedIndexes.value.length}/${missingPaths.length})`)
                ]),
                h('div', { style: { maxHeight: '320px', overflowY: 'auto', border: '1px solid var(--ant-color-border)', borderRadius: '4px', padding: '8px' } },
                    missingPaths.map(item =>
                        h('div', { style: { marginBottom: '8px' } }, [
                            h(Checkbox, {
                                checked: selectedIndexes.value.includes(item.index),
                                onChange: event => toggleOne(item.index, event.target.checked)
                            }, () => h('span', { style: { fontSize: '12px', wordBreak: 'break-all' } }, item.path))
                        ])
                    )
                )
            ]);
        }
    });

    Modal.confirm({
        title: '路径检测结果',
        width: 720,
        content: h(MissingPathCleanupContent),
        okText: '删除选中项',
        cancelText: '保留',
        onOk() {
            if (selectedIndexes.value.length === 0) {
                message.info('未删除任何路径');
                return;
            }

            const removeIndexes = new Set(selectedIndexes.value);
            editList.value = editList.value.filter((_, index) => !removeIndexes.has(index));
            isDirty.value = true;
            message.success(`已删除 ${removeIndexes.size} 个不存在的路径`);
        }
    });
}

function checkEditPaths() {
    const duplicateRemovedCount = removeDuplicateEditPaths();
    const results = {};
    const missingPaths = [];

    editList.value.forEach((item, index) => {
        if (!window.services?.isPathLike(item)) return;

        const exists = window.services.checkPathExists(item);
        results[item] = exists;
        if (!exists) {
            missingPaths.push({
                index,
                path: item
            });
        }
    });

    pathCheckResults.value = results;

    if (duplicateRemovedCount > 0) {
        isDirty.value = true;
    }

    if (missingPaths.length > 0) {
        showMissingPathCleanupModal(missingPaths, duplicateRemovedCount);
        return;
    }

    if (duplicateRemovedCount > 0) {
        message.success(`检测完成，已删除 ${duplicateRemovedCount} 个重复路径，未发现不存在路径`);
    } else {
        message.success('检测完成，未发现重复或不存在的路径');
    }
}
</script>

<style scoped>
.env-var-card {
    width: 100%;
    height: fit-content;
    max-width: 100%;
    border: 1px solid var(--ui-border);
    border-radius: var(--ui-radius-md);
    background: var(--ui-surface);
    box-shadow: var(--ui-shadow-xs);
    transition: border-color 0.16s ease, box-shadow 0.16s ease, transform 0.16s ease;
}

.env-var-card:hover {
    border-color: var(--ui-border-strong);
    background: var(--ui-surface);
    box-shadow: var(--ui-shadow-md);
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
    margin-right: 10px;
    color: var(--ui-text);
    font-family: var(--font-mono);
    font-size: 12.5px;
    font-weight: 600;
    letter-spacing: 0.01em;
    word-break: break-word;
}

.path-card .var-name {
    color: var(--ui-success);
}

.clickable {
    cursor: pointer;
    transition: all 0.2s;
    user-select: none;
}

.clickable:hover {
    background-color: var(--ui-surface-muted);
    border-radius: var(--ui-radius-xs);
}

.clickable:active {
    opacity: 0.5;
}

.var-value {
    color: var(--ui-text-muted);
    font-family: var(--font-mono);
    font-size: 12.5px;
    line-height: 1.6;
    word-break: break-all;
}

.normal-value {
    padding: 6px 8px;
    border: 1px solid var(--ui-border);
    border-radius: var(--ui-radius-sm);
    background: var(--ui-surface-muted);
    white-space: pre-wrap;
}

.path-list-container {
    max-height: 320px;
    padding: 8px 10px;
    overflow-y: auto;
    border: 1px solid var(--ui-border);
    border-radius: var(--ui-radius-sm);
    background: var(--ui-surface-muted);
    cursor: pointer;
    transition: border-color 0.16s ease;
}

.path-list-container:hover {
    border-color: var(--ui-border-strong);
}

.path-list {
    list-style: none;
    padding-left: 0;
    margin: 0;
}

.path-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 3px 4px;
    border-radius: var(--ui-radius-xs);
    font-size: 12px;
    line-height: 1.5;
}

.path-item:hover {
    background: var(--ui-raised-surface);
}

.path-status {
    font-size: 14px;
    font-weight: bold;
    flex-shrink: 0;
}

.path-exist {
    color: var(--ui-success);
}

.path-not-exist {
    color: var(--ui-danger);
}

.normal-value-wrapper {
    display: flex;
    align-items: center;
    gap: 8px;
}

.path-edit-container {
    padding: 10px;
    border: 1px solid var(--ui-border);
    border-radius: var(--ui-radius-sm);
    background: var(--ui-surface-muted);
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
    align-items: center;
    gap: 4px;
    margin-bottom: 6px;
}

.path-edit-item :deep(.ant-input) {
    flex: 1;
}

/* 禁用变量样式 */
.disabled-card {
    opacity: 0.72;
    border-style: dashed;
    border-color: var(--ui-border-strong);
    background: var(--ui-surface-muted);
}

.disabled-text {
    color: var(--ui-text-soft);
    text-decoration: line-through;
}

.disabled-card .var-value {
    color: var(--ui-text-soft);
}

.env-card-context-menu {
    position: fixed;
    z-index: 3000;
    min-width: 180px;
    padding: 5px;
    border: 1px solid var(--ui-border);
    border-radius: var(--ui-radius-md);
    background: var(--ui-floating-surface);
    color: var(--ui-text);
    box-shadow: var(--ui-shadow-lg);
}

.context-menu-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    min-height: 30px;
    padding: 6px 10px;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: inherit;
    font-size: 13px;
    text-align: left;
    white-space: nowrap;
    cursor: pointer;
}

.context-menu-item:hover {
    background: var(--ui-raised-surface-hover);
}

.context-menu-item.danger:hover {
    background: var(--ui-danger-bg);
}

.context-menu-item.danger {
    color: var(--ui-danger);
}

.context-menu-icon {
    flex: 0 0 auto;
    font-size: 14px;
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
