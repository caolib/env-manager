<script setup>
import { computed, ref, watch } from 'vue';
import { sortObjectKeys } from '../utils/configDiff';

const props = defineProps({
    left: {
        type: [Object, Array, String, Number, Boolean],
        default: null
    },
    right: {
        type: [Object, Array, String, Number, Boolean],
        default: null
    },
    emptyText: {
        type: String,
        default: '没有检测到变化'
    },
    hideUnchangedDefault: {
        type: Boolean,
        default: true
    },
    sortKeys: {
        type: Boolean,
        default: false
    },
    leftTitle: {
        type: String,
        default: '当前 JSON'
    },
    rightTitle: {
        type: String,
        default: '对比 JSON'
    }
});

const viewMode = ref('split');
const showUnchanged = ref(!props.hideUnchangedDefault);

function normalizeValue(value) {
    return props.sortKeys ? sortObjectKeys(value ?? null) : (value ?? null);
}

function formatJson(value) {
    return JSON.stringify(normalizeValue(value), null, 2);
}

function createMatrix(leftLines, rightLines) {
    const matrix = Array.from({ length: leftLines.length + 1 }, () => new Uint32Array(rightLines.length + 1));

    for (let leftIndex = 1; leftIndex <= leftLines.length; leftIndex++) {
        for (let rightIndex = 1; rightIndex <= rightLines.length; rightIndex++) {
            matrix[leftIndex][rightIndex] = leftLines[leftIndex - 1] === rightLines[rightIndex - 1]
                ? matrix[leftIndex - 1][rightIndex - 1] + 1
                : Math.max(matrix[leftIndex - 1][rightIndex], matrix[leftIndex][rightIndex - 1]);
        }
    }

    return matrix;
}

function buildLineOps(leftLines, rightLines) {
    const matrix = createMatrix(leftLines, rightLines);
    const ops = [];
    let leftIndex = leftLines.length;
    let rightIndex = rightLines.length;

    while (leftIndex > 0 || rightIndex > 0) {
        if (leftIndex > 0 && rightIndex > 0 && leftLines[leftIndex - 1] === rightLines[rightIndex - 1]) {
            ops.push({ type: 'equal', left: leftLines[leftIndex - 1], right: rightLines[rightIndex - 1] });
            leftIndex--;
            rightIndex--;
        } else if (rightIndex > 0 && (leftIndex === 0 || matrix[leftIndex][rightIndex - 1] > matrix[leftIndex - 1][rightIndex])) {
            ops.push({ type: 'add', right: rightLines[rightIndex - 1] });
            rightIndex--;
        } else {
            ops.push({ type: 'remove', left: leftLines[leftIndex - 1] });
            leftIndex--;
        }
    }

    return ops.reverse();
}

function pushChangedRows(rows, removedLines, addedLines, counters) {
    const count = Math.max(removedLines.length, addedLines.length);

    for (let index = 0; index < count; index++) {
        const hasLeft = index < removedLines.length;
        const hasRight = index < addedLines.length;
        const type = hasLeft && hasRight ? 'modify' : (hasLeft ? 'remove' : 'add');
        rows.push({
            key: `row:${rows.length}`,
            type,
            leftLineNumber: hasLeft ? counters.left++ : null,
            rightLineNumber: hasRight ? counters.right++ : null,
            left: hasLeft ? removedLines[index] : '',
            right: hasRight ? addedLines[index] : ''
        });
    }
}

function buildRows(leftLines, rightLines) {
    const ops = buildLineOps(leftLines, rightLines);
    const rows = [];
    const counters = { left: 1, right: 1 };
    let removedLines = [];
    let addedLines = [];

    ops.forEach(op => {
        if (op.type === 'equal') {
            pushChangedRows(rows, removedLines, addedLines, counters);
            removedLines = [];
            addedLines = [];
            rows.push({
                key: `row:${rows.length}`,
                type: 'equal',
                leftLineNumber: counters.left++,
                rightLineNumber: counters.right++,
                left: op.left,
                right: op.right
            });
            return;
        }

        if (op.type === 'remove') {
            removedLines.push(op.left);
        } else {
            addedLines.push(op.right);
        }
    });

    pushChangedRows(rows, removedLines, addedLines, counters);
    return rows;
}

function buildVisibleRows(rows) {
    if (showUnchanged.value) {
        return rows;
    }

    const visibleRows = [];
    let hiddenCount = 0;

    rows.forEach(row => {
        if (row.type === 'equal') {
            hiddenCount++;
            return;
        }

        if (hiddenCount > 0) {
            visibleRows.push({
                key: `hidden:${visibleRows.length}`,
                type: 'hidden',
                count: hiddenCount
            });
            hiddenCount = 0;
        }

        visibleRows.push(row);
    });

    return visibleRows;
}

function buildUnifiedRows(rows) {
    const unifiedRows = [];

    rows.forEach(row => {
        if (row.type === 'hidden') {
            unifiedRows.push(row);
            return;
        }

        if (row.type === 'equal') {
            unifiedRows.push({
                key: `${row.key}:equal`,
                type: 'equal',
                marker: ' ',
                lineNumber: row.rightLineNumber,
                text: row.right
            });
            return;
        }

        if (row.type === 'remove' || row.type === 'modify') {
            unifiedRows.push({
                key: `${row.key}:remove`,
                type: 'remove',
                marker: '-',
                lineNumber: row.leftLineNumber,
                text: row.left
            });
        }

        if (row.type === 'add' || row.type === 'modify') {
            unifiedRows.push({
                key: `${row.key}:add`,
                type: 'add',
                marker: '+',
                lineNumber: row.rightLineNumber,
                text: row.right
            });
        }
    });

    return unifiedRows;
}

const leftText = computed(() => formatJson(props.left));
const rightText = computed(() => formatJson(props.right));
const hasDiff = computed(() => leftText.value !== rightText.value);
const diffRows = computed(() => buildRows(leftText.value.split('\n'), rightText.value.split('\n')));
const visibleRows = computed(() => buildVisibleRows(diffRows.value));
const unifiedRows = computed(() => buildUnifiedRows(visibleRows.value));

watch(
    () => [props.left, props.right, props.hideUnchangedDefault],
    () => {
        showUnchanged.value = !props.hideUnchangedDefault;
    }
);
</script>

<template>
    <div class="json-diff-view">
        <div v-if="hasDiff" class="json-diff-toolbar">
            <div class="json-diff-labels">
                <span>{{ leftTitle }}</span>
                <span class="json-diff-arrow">-></span>
                <span>{{ rightTitle }}</span>
            </div>

            <div class="json-diff-actions">
                <a-radio-group v-model:value="viewMode" size="small" button-style="solid">
                    <a-radio-button value="split">左右</a-radio-button>
                    <a-radio-button value="unified">统一</a-radio-button>
                </a-radio-group>
                <a-button size="small" @click="showUnchanged = !showUnchanged">
                    {{ showUnchanged ? '隐藏未变化行' : '显示未变化行' }}
                </a-button>
            </div>
        </div>

        <div v-if="hasDiff && viewMode === 'split'" class="json-diff-body split-diff">
            <div class="split-header">
                <div class="split-header-cell">{{ leftTitle }}</div>
                <div class="split-header-cell">{{ rightTitle }}</div>
            </div>

            <div v-for="row in visibleRows" :key="row.key" :class="['split-row', row.type]">
                <template v-if="row.type === 'hidden'">
                    <div class="hidden-row" :title="`${row.count} 行未变化`">...</div>
                    <div class="hidden-row" :title="`${row.count} 行未变化`">...</div>
                </template>

                <template v-else>
                    <div :class="['diff-cell', row.type === 'add' ? 'empty' : row.type]">
                        <span class="line-number">{{ row.leftLineNumber || '' }}</span>
                        <pre class="line-text">{{ row.left }}</pre>
                    </div>
                    <div :class="['diff-cell', row.type === 'remove' ? 'empty' : row.type]">
                        <span class="line-number">{{ row.rightLineNumber || '' }}</span>
                        <pre class="line-text">{{ row.right }}</pre>
                    </div>
                </template>
            </div>
        </div>

        <div v-else-if="hasDiff" class="json-diff-body unified-diff">
            <div v-for="row in unifiedRows" :key="row.key" :class="['unified-row', row.type]">
                <template v-if="row.type === 'hidden'">
                    <div class="hidden-row" :title="`${row.count} 行未变化`">...</div>
                </template>

                <template v-else>
                    <span class="line-marker">{{ row.marker }}</span>
                    <span class="line-number">{{ row.lineNumber || '' }}</span>
                    <pre class="line-text">{{ row.text }}</pre>
                </template>
            </div>
        </div>

        <div v-else class="json-diff-empty">
            {{ emptyText }}
        </div>
    </div>
</template>

<style scoped>
.json-diff-view {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
    width: 100%;
}

.json-diff-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px;
}

.json-diff-labels,
.json-diff-actions {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
}

.json-diff-labels {
    color: var(--ant-color-text-secondary);
    font-size: 12px;
}

.json-diff-arrow {
    color: var(--ant-color-text-tertiary);
}

.json-diff-body {
    min-width: 0;
    overflow: auto;
    max-height: calc(100vh - 230px);
    border: 1px solid var(--ant-color-border);
    border-radius: 6px;
    background: var(--ant-color-bg-container);
    font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace;
    font-size: 12px;
    line-height: 1.55;
}

.split-header,
.split-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    min-width: 920px;
}

.split-header {
    position: sticky;
    top: 0;
    z-index: 1;
    border-bottom: 1px solid var(--ant-color-border);
    background: var(--ant-color-bg-container);
}

.split-header-cell {
    padding: 6px 10px;
    color: var(--ant-color-text-secondary);
    font-family: inherit;
    font-weight: 600;
}

.split-header-cell + .split-header-cell,
.split-row .diff-cell + .diff-cell,
.split-row .hidden-row + .hidden-row {
    border-left: 1px solid var(--ant-color-border);
}

.diff-cell,
.unified-row {
    display: grid;
    grid-template-columns: 48px minmax(0, 1fr);
    align-items: start;
    min-width: 0;
}

.unified-row {
    grid-template-columns: 24px 48px minmax(0, 1fr);
}

.line-number,
.line-marker {
    user-select: none;
    color: var(--ant-color-text-tertiary);
    text-align: right;
    padding: 0 8px;
}

.line-marker {
    text-align: center;
}

.line-text {
    margin: 0;
    min-width: 0;
    padding: 0 10px;
    overflow: hidden;
    color: var(--ui-text);
    font-family: var(--font-mono);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    word-break: break-word;
}

.diff-cell.add,
.unified-row.add {
    background: color-mix(in srgb, var(--ui-success) 14%, transparent);
}

.diff-cell.remove,
.unified-row.remove {
    background: color-mix(in srgb, var(--ui-danger) 13%, transparent);
}

.diff-cell.modify {
    background: color-mix(in srgb, var(--ui-warning) 14%, transparent);
}

.diff-cell.empty {
    background: var(--ant-color-fill-quaternary);
}

.hidden-row {
    padding: 2px 10px;
    color: var(--ant-color-text-tertiary);
    text-align: center;
    background: var(--ant-color-fill-quaternary);
}

.json-diff-empty {
    padding: 32px 0;
    color: var(--ant-color-text-tertiary);
    text-align: center;
}
</style>
