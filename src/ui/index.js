/* global document */
/* eslint-disable vue/one-component-per-file */
import {
  cloneVNode,
  computed,
  createApp,
  defineComponent,
  getCurrentInstance,
  h,
  inject,
  isVNode,
  provide,
  ref,
  watch
} from 'vue';
import { getData, setData } from '../utils/store';

const TABLE_PAGE_SIZE_STORAGE_PREFIX = 'env-manager-table-page-size:';
const DEFAULT_PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

function slotContent(slots, name = 'default', props = {}) {
  return slots[name] ? slots[name](props) : [];
}

function isPromiseLike(value) {
  return value && typeof value.then === 'function';
}

function getRowKey(rowKey, record, index) {
  if (typeof rowKey === 'function') return rowKey(record);
  if (typeof rowKey === 'string') return record?.[rowKey];
  return record?.key ?? record?.id ?? record?.name ?? index;
}

function normalizeSize(size) {
  return typeof size === 'number' ? `${size}px` : size;
}

function normalizePageSize(value, fallback = 10) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue <= 0) return fallback;
  return Math.max(1, Math.floor(numberValue));
}

function normalizePageSizeOptions(options, currentSize) {
  const source = Array.isArray(options) && options.length > 0 ? options : DEFAULT_PAGE_SIZE_OPTIONS;
  const values = source
    .map(item => normalizePageSize(item, 0))
    .filter(Boolean);

  if (currentSize && !values.includes(currentSize)) {
    values.push(currentSize);
  }

  return [...new Set(values)].sort((a, b) => a - b);
}

export const UiCheckbox = defineComponent({
  name: 'UiCheckbox',
  props: {
    checked: Boolean,
    indeterminate: Boolean,
    disabled: Boolean
  },
  emits: ['update:checked', 'change'],
  setup(props, { emit, slots }) {
    return () => h('label', {
      class: ['ui-checkbox', { 'ui-checkbox-disabled': props.disabled }]
    }, [
      h('input', {
        type: 'checkbox',
        checked: props.checked,
        disabled: props.disabled,
        ref: (el) => {
          if (el) el.indeterminate = props.indeterminate;
        },
        onChange: (event) => {
          emit('update:checked', event.target.checked);
          emit('change', event);
        }
      }),
      h('span', { class: 'ui-checkbox-label' }, slotContent(slots))
    ]);
  }
});

const UiButton = defineComponent({
  name: 'UiButton',
  props: {
    type: { type: String, default: 'default' },
    size: { type: String, default: 'middle' },
    danger: Boolean,
    disabled: Boolean,
    loading: Boolean,
    title: String
  },
  emits: ['click'],
  setup(props, { emit, slots, attrs }) {
    return () => h('button', {
      ...attrs,
      type: 'button',
      title: props.title ?? attrs.title,
      disabled: props.disabled || props.loading,
      class: [
        'ui-button',
        `ui-button-${props.type || 'default'}`,
        `ui-button-${props.size || 'middle'}`,
        {
          'ui-button-danger': props.danger,
          'ui-button-loading': props.loading
        },
        attrs.class
      ],
      onClick: (event) => {
        if (props.disabled || props.loading) return;
        emit('click', event);
      }
    }, [
      props.loading ? h('span', { class: 'ui-spinner', 'aria-hidden': 'true' }) : null,
      slotContent(slots)
    ]);
  }
});

const UiSpace = defineComponent({
  name: 'UiSpace',
  props: {
    size: { type: [Number, String], default: 8 },
    wrap: Boolean
  },
  setup(props, { slots, attrs }) {
    return () => h('div', {
      ...attrs,
      class: ['ui-space', { 'ui-space-wrap': props.wrap }, attrs.class],
      style: [{ gap: normalizeSize(props.size) }, attrs.style]
    }, slotContent(slots));
  }
});

const UiTag = defineComponent({
  name: 'UiTag',
  props: {
    color: { type: String, default: 'default' },
    closable: Boolean
  },
  emits: ['close'],
  setup(props, { emit, slots, attrs }) {
    return () => h('span', {
      ...attrs,
      class: ['ui-tag', `ui-tag-${props.color || 'default'}`, attrs.class]
    }, [
      slotContent(slots),
      props.closable ? h('button', {
        type: 'button',
        class: 'ui-tag-close',
        'aria-label': '关闭',
        onClick: (event) => emit('close', event)
      }, '×') : null
    ]);
  }
});

const UiCard = defineComponent({
  name: 'UiCard',
  props: {
    size: { type: String, default: 'middle' }
  },
  setup(props, { slots, attrs }) {
    return () => h('section', {
      ...attrs,
      class: ['ui-card', `ui-card-${props.size}`, attrs.class]
    }, [
      (slots.title || slots.extra) ? h('header', { class: 'ui-card-head' }, [
        h('div', { class: 'ui-card-title' }, slotContent(slots, 'title')),
        h('div', { class: 'ui-card-extra' }, slotContent(slots, 'extra'))
      ]) : null,
      h('div', { class: 'ui-card-body' }, slotContent(slots))
    ]);
  }
});

const UiTable = defineComponent({
  name: 'UiTable',
  props: {
    dataSource: { type: Array, default: () => [] },
    columns: { type: Array, default: () => [] },
    pagination: { type: [Boolean, Object], default: false },
    rowKey: { type: [String, Function], default: 'key' },
    customRow: Function,
    loading: Boolean,
    bordered: Boolean,
    size: { type: String, default: 'middle' },
    locale: { type: Object, default: () => ({}) },
    scroll: { type: Object, default: () => ({}) }
  },
  setup(props, { slots, attrs }) {
    const page = ref(1);
    const sortState = ref({ key: '', order: '' });
    const activePageSize = ref(10);

    const sortedRows = computed(() => {
      const rows = [...props.dataSource];
      const column = props.columns.find(item => item.key === sortState.value.key);
      if (!column?.sorter || !sortState.value.order) return rows;
      return rows.sort((a, b) => {
        const result = column.sorter(a, b);
        return sortState.value.order === 'asc' ? result : -result;
      });
    });

    const paginationConfig = computed(() => {
      if (!props.pagination) return null;
      return typeof props.pagination === 'object' ? props.pagination : {};
    });

    const pageSizeStorageKey = computed(() => {
      const key = paginationConfig.value?.pageSizeStorageKey || paginationConfig.value?.storageKey;
      return key ? `${TABLE_PAGE_SIZE_STORAGE_PREFIX}${key}` : '';
    });

    function resolvePageSize() {
      const configured = normalizePageSize(paginationConfig.value?.pageSize, 10);
      if (!pageSizeStorageKey.value) return configured;
      return normalizePageSize(getData(pageSizeStorageKey.value, configured), configured);
    }

    watch(
      () => [pageSizeStorageKey.value, paginationConfig.value?.pageSize],
      () => {
        activePageSize.value = resolvePageSize();
        page.value = 1;
      },
      { immediate: true }
    );

    const pageSize = computed(() => {
      if (!paginationConfig.value) return 0;
      return activePageSize.value || normalizePageSize(paginationConfig.value.pageSize, 10);
    });

    const pageSizeOptions = computed(() => normalizePageSizeOptions(
      paginationConfig.value?.pageSizeOptions,
      pageSize.value
    ));

    const showSizeChanger = computed(() => {
      if (!paginationConfig.value) return false;
      return paginationConfig.value.showSizeChanger !== false && pageSizeOptions.value.length > 1;
    });

    const visibleRows = computed(() => {
      if (!pageSize.value) return sortedRows.value;
      const start = (page.value - 1) * pageSize.value;
      return sortedRows.value.slice(start, start + pageSize.value);
    });

    function toggleSort(column) {
      if (!column.sorter) return;
      if (sortState.value.key !== column.key) {
        sortState.value = { key: column.key, order: 'asc' };
        return;
      }
      sortState.value = {
        key: column.key,
        order: sortState.value.order === 'asc' ? 'desc' : sortState.value.order === 'desc' ? '' : 'asc'
      };
    }

    function renderCell(column, record, index) {
      const content = slots.bodyCell?.({
        column,
        record,
        index,
        text: column.dataIndex ? record?.[column.dataIndex] : undefined
      });

      if (content && content.length > 0) return content;
      if (column.dataIndex) return String(record?.[column.dataIndex] ?? '');
      return '';
    }

    function getTotalPages() {
      return pageSize.value ? Math.max(1, Math.ceil(sortedRows.value.length / pageSize.value)) : 1;
    }

    function clampPage() {
      const totalPages = getTotalPages();
      if (page.value > totalPages) page.value = totalPages;
      if (page.value < 1) page.value = 1;
    }

    function updatePageSize(event) {
      const nextSize = normalizePageSize(event.target.value, pageSize.value);
      activePageSize.value = nextSize;
      page.value = 1;

      if (pageSizeStorageKey.value) {
        setData(pageSizeStorageKey.value, nextSize);
      }
    }

    watch(
      () => [pageSize.value, sortedRows.value.length],
      () => { clampPage(); }
    );

    return () => {
      const totalPages = getTotalPages();
      const hasPagination = pageSize.value && sortedRows.value.length > 0 && (totalPages > 1 || showSizeChanger.value);

      return h('div', {
        ...attrs,
        class: [
          'ui-table-wrap',
          `ui-table-${props.size}`,
          { 'ui-table-bordered': props.bordered },
          attrs.class
        ]
      }, [
        h('div', {
          class: 'ui-table-scroll',
          style: props.scroll?.y
            ? {
              maxHeight: typeof props.scroll.y === 'number' ? `${props.scroll.y}px` : props.scroll.y,
              overflow: 'auto'
            }
            : null
        }, [
          h('table', {
            class: 'ui-table',
            style: props.scroll?.x
              ? { minWidth: typeof props.scroll.x === 'number' ? `${props.scroll.x}px` : props.scroll.x }
              : null
          }, [
            h('thead', {}, h('tr', {}, props.columns.map(column =>
              h('th', {
                key: column.key || column.dataIndex,
                style: {
                  width: typeof column.width === 'number' ? `${column.width}px` : column.width,
                  textAlign: column.align || 'left'
                },
                class: { 'ui-table-sortable': !!column.sorter },
                onClick: () => toggleSort(column)
              }, [
                column.title,
                column.sorter ? h('span', { class: 'ui-table-sort' },
                  sortState.value.key === column.key
                    ? (sortState.value.order === 'asc' ? ' ↑' : sortState.value.order === 'desc' ? ' ↓' : '')
                    : ''
                ) : null
              ])
            ))),
            h('tbody', {}, [
              props.loading ? h('tr', {}, [
                h('td', { colspan: props.columns.length || 1, class: 'ui-table-empty' }, '加载中...')
              ]) : null,
              !props.loading && visibleRows.value.length === 0 ? h('tr', {}, [
                h('td', { colspan: props.columns.length || 1, class: 'ui-table-empty' },
                  props.locale.emptyText || '暂无数据'
                )
              ]) : null,
              !props.loading ? visibleRows.value.map((record, index) => {
                const rowProps = props.customRow?.(record, index) || {};
                return h('tr', {
                  key: getRowKey(props.rowKey, record, index),
                  ...rowProps,
                  class: [rowProps.class]
                }, props.columns.map(column =>
                  h('td', {
                    key: column.key || column.dataIndex,
                    style: {
                      width: typeof column.width === 'number' ? `${column.width}px` : column.width,
                      textAlign: column.align || 'left'
                    }
                  }, renderCell(column, record, index))
                ));
              }) : null
            ])
          ])
        ]),
        hasPagination ? h('div', { class: 'ui-pagination' }, [
          h('span', { class: 'ui-pagination-total' }, `共 ${sortedRows.value.length} 条`),
          showSizeChanger.value ? h('label', { class: 'ui-page-size' }, [
            h('span', {}, '每页'),
            h('select', {
              class: 'ui-page-size-select',
              value: pageSize.value,
              onChange: updatePageSize
            }, pageSizeOptions.value.map(size => h('option', {
              key: size,
              value: size
            }, `${size} 条`)))
          ]) : null,
          h('div', { class: 'ui-page-nav' }, [
            h(UiButton, {
              size: 'small',
              disabled: page.value <= 1,
              onClick: () => { page.value -= 1; }
            }, () => '上一页'),
            h('span', { class: 'ui-page-current' }, `${page.value}/${totalPages}`),
            h(UiButton, {
              size: 'small',
              disabled: page.value >= totalPages,
              onClick: () => { page.value += 1; }
            }, () => '下一页')
          ])
        ]) : null
      ]);
    };
  }
});

const UiCollapse = defineComponent({
  name: 'UiCollapse',
  props: {
    activeKey: { type: [Array, String, Number], default: () => [] },
    bordered: Boolean
  },
  emits: ['update:activeKey'],
  setup(props, { emit, slots, attrs }) {
    const activeKeys = computed(() => Array.isArray(props.activeKey) ? props.activeKey : [props.activeKey]);

    provide('uiCollapse', {
      activeKeys,
      toggle(key) {
        const current = activeKeys.value.map(String);
        const textKey = String(key);
        const next = current.includes(textKey)
          ? current.filter(item => item !== textKey)
          : [...current, textKey];
        emit('update:activeKey', next);
      }
    });

    return () => h('div', {
      ...attrs,
      class: ['ui-collapse', { 'ui-collapse-bordered': props.bordered }, attrs.class]
    }, slotContent(slots));
  }
});

const UiCollapsePanel = defineComponent({
  name: 'UiCollapsePanel',
  setup(_, { slots, attrs }) {
    const instance = getCurrentInstance();
    const panelKey = computed(() => String(instance?.vnode?.key ?? attrs.panelKey ?? attrs.name ?? 'panel'));
    const collapse = inject('uiCollapse', null);
    const isActive = computed(() => collapse?.activeKeys.value.map(String).includes(panelKey.value));

    function shouldSkipToggle(event) {
      return event.target?.closest?.('button,a,input,textarea,select,label');
    }

    return () => h('section', { class: 'ui-collapse-panel' }, [
      h('div', {
        class: 'ui-collapse-header',
        role: 'button',
        tabindex: 0,
        onClick: (event) => {
          if (shouldSkipToggle(event)) return;
          collapse?.toggle(panelKey.value);
        },
        onKeydown: (event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          collapse?.toggle(panelKey.value);
        }
      }, [
        h('span', { class: ['ui-collapse-arrow', { open: isActive.value }], 'aria-hidden': 'true' }, [
          h('svg', { viewBox: '0 0 16 16', width: 12, height: 12, fill: 'none' }, [
            h('path', {
              d: 'M6 3.5 10.5 8 6 12.5',
              stroke: 'currentColor',
              'stroke-width': 1.6,
              'stroke-linecap': 'round',
              'stroke-linejoin': 'round'
            })
          ])
        ]),
        h('span', { class: 'ui-collapse-title' }, slotContent(slots, 'header'))
      ]),
      isActive.value ? h('div', { class: 'ui-collapse-content' }, slotContent(slots)) : null
    ]);
  }
});

const UiInput = defineComponent({
  name: 'UiInput',
  props: {
    value: { type: [String, Number], default: '' },
    placeholder: String,
    size: String,
    allowClear: Boolean,
    autofocus: Boolean
  },
  emits: ['update:value', 'input', 'pressEnter', 'keydown', 'focus', 'blur'],
  setup(props, { emit, slots, attrs }) {
    function update(event) {
      emit('update:value', event.target.value);
      emit('input', event);
    }

    return () => h('div', {
      class: ['ui-input-wrap', { 'ui-input-wrap-affix': slots.prefix || slots.suffix || props.allowClear }, attrs.class],
      style: attrs.style
    }, [
      slots.prefix ? h('span', { class: 'ui-input-affix' }, slotContent(slots, 'prefix')) : null,
      h('input', {
        ...attrs,
        class: ['ui-input', props.size === 'small' ? 'ui-input-small' : ''],
        style: undefined,
        value: props.value,
        placeholder: props.placeholder,
        autofocus: props.autofocus,
        onInput: update,
        onFocus: event => emit('focus', event),
        onBlur: event => emit('blur', event),
        onKeydown: (event) => {
          emit('keydown', event);
          if (event.key === 'Enter') emit('pressEnter', event);
        }
      }),
      props.allowClear && props.value ? h('button', {
        type: 'button',
        class: 'ui-input-clear',
        onClick: () => emit('update:value', '')
      }, '×') : null,
      slots.suffix ? h('span', { class: 'ui-input-affix' }, slotContent(slots, 'suffix')) : null
    ]);
  }
});

const UiTextarea = defineComponent({
  name: 'UiTextarea',
  props: {
    value: { type: [String, Number], default: '' },
    placeholder: String,
    rows: { type: Number, default: 3 },
    autoSize: { type: [Boolean, Object], default: false }
  },
  emits: ['update:value', 'input', 'keydown', 'focus', 'blur'],
  setup(props, { emit, attrs }) {
    return () => h('textarea', {
      ...attrs,
      class: ['ui-textarea', attrs.class],
      value: props.value,
      placeholder: props.placeholder,
      rows: props.autoSize?.minRows || props.rows,
      onInput: (event) => {
        emit('update:value', event.target.value);
        emit('input', event);
      },
      onFocus: event => emit('focus', event),
      onBlur: event => emit('blur', event),
      onKeydown: event => emit('keydown', event)
    });
  }
});

const UiInputNumber = defineComponent({
  name: 'UiInputNumber',
  props: {
    value: Number,
    min: Number,
    max: Number,
    precision: Number
  },
  emits: ['update:value'],
  setup(props, { emit, attrs }) {
    return () => h('input', {
      ...attrs,
      type: 'number',
      class: ['ui-input', 'ui-input-number', attrs.class],
      value: props.value,
      min: props.min,
      max: props.max,
      step: props.precision === 0 ? 1 : 'any',
      onInput: (event) => {
        const value = event.target.value === '' ? null : Number(event.target.value);
        emit('update:value', value);
      }
    });
  }
});

const UiAutoComplete = defineComponent({
  name: 'UiAutoComplete',
  props: {
    value: { type: [String, Number], default: '' },
    options: { type: Array, default: () => [] },
    placeholder: String
  },
  emits: ['update:value', 'select'],
  setup(props, { emit, slots, attrs }) {
    const open = ref(false);

    function update(value) {
      emit('update:value', value);
      open.value = true;
    }

    function renderControl() {
      const children = slotContent(slots);
      const child = children.find(isVNode);
      if (child) {
        return cloneVNode(child, {
          value: props.value,
          placeholder: props.placeholder,
          'onUpdate:value': update,
          onFocus: () => { open.value = true; },
          onBlur: () => window.setTimeout(() => { open.value = false; }, 120)
        }, true);
      }

      return h(UiInput, {
        value: props.value,
        placeholder: props.placeholder,
        'onUpdate:value': update,
        onFocus: () => { open.value = true; },
        onBlur: () => window.setTimeout(() => { open.value = false; }, 120)
      });
    }

    return () => h('div', {
      ...attrs,
      class: ['ui-autocomplete', attrs.class]
    }, [
      renderControl(),
      open.value && props.options.length > 0 ? h('div', { class: 'ui-autocomplete-list' },
        props.options.slice(0, 20).map(option => h('button', {
          type: 'button',
          class: 'ui-autocomplete-option',
          onMousedown: (event) => {
            event.preventDefault();
            emit('update:value', option.value);
            emit('select', option.value, option);
            open.value = false;
          }
        }, option.label || option.value))
      ) : null
    ]);
  }
});

const UiSwitch = defineComponent({
  name: 'UiSwitch',
  props: {
    checked: Boolean,
    checkedChildren: String,
    unCheckedChildren: String
  },
  emits: ['update:checked', 'change'],
  setup(props, { emit }) {
    return () => h('button', {
      type: 'button',
      role: 'switch',
      'aria-checked': String(props.checked),
      class: ['ui-switch', { 'ui-switch-checked': props.checked }],
      onClick: () => {
        emit('update:checked', !props.checked);
        emit('change', !props.checked);
      }
    }, h('span', { class: 'ui-switch-label' }, props.checked ? props.checkedChildren : props.unCheckedChildren));
  }
});

const UiRadioGroup = defineComponent({
  name: 'UiRadioGroup',
  props: {
    value: [String, Number, Boolean],
    size: String,
    buttonStyle: String
  },
  emits: ['update:value', 'change'],
  setup(props, { emit, slots, attrs }) {
    provide('uiRadioGroup', {
      value: computed(() => props.value),
      update(value) {
        emit('update:value', value);
        emit('change', value);
      }
    });

    return () => h('div', {
      ...attrs,
      class: ['ui-radio-group', attrs.class]
    }, slotContent(slots));
  }
});

const UiRadioButton = defineComponent({
  name: 'UiRadioButton',
  props: {
    value: [String, Number, Boolean]
  },
  setup(props, { slots }) {
    const group = inject('uiRadioGroup');
    return () => h('button', {
      type: 'button',
      class: ['ui-radio-button', { active: group?.value.value === props.value }],
      onClick: () => group?.update(props.value)
    }, slotContent(slots));
  }
});

const UiRadio = defineComponent({
  name: 'UiRadio',
  props: {
    value: [String, Number, Boolean]
  },
  setup(props, { slots }) {
    const group = inject('uiRadioGroup');
    return () => h('label', { class: 'ui-radio' }, [
      h('input', {
        type: 'radio',
        checked: group?.value.value === props.value,
        onChange: () => group?.update(props.value)
      }),
      h('span', {}, slotContent(slots))
    ]);
  }
});

const UiForm = defineComponent({
  name: 'UiForm',
  setup(_, { slots, attrs }) {
    return () => h('form', {
      ...attrs,
      class: ['ui-form', attrs.class],
      onSubmit: event => event.preventDefault()
    }, slotContent(slots));
  }
});

const UiFormItem = defineComponent({
  name: 'UiFormItem',
  props: {
    label: String,
    required: Boolean
  },
  setup(props, { slots, attrs }) {
    return () => h('div', {
      ...attrs,
      class: ['ui-form-item', attrs.class]
    }, [
      props.label ? h('label', { class: 'ui-form-label' }, [
        props.label,
        props.required ? h('span', { class: 'ui-required' }, ' *') : null
      ]) : null,
      h('div', { class: 'ui-form-control' }, slotContent(slots))
    ]);
  }
});

const UiModal = defineComponent({
  name: 'UiModal',
  props: {
    open: Boolean,
    title: String,
    width: { type: [String, Number], default: '520px' },
    okText: { type: String, default: '确定' },
    cancelText: { type: String, default: '取消' },
    confirmLoading: Boolean,
    okButtonProps: { type: Object, default: () => ({}) },
    wrapClassName: String,
    bodyStyle: { type: Object, default: () => ({}) },
    height: [String, Number]
  },
  emits: ['update:open', 'ok', 'cancel'],
  setup(props, { emit, slots, attrs }) {
    function cancel(event) {
      emit('cancel', event);
      emit('update:open', false);
    }

    return () => props.open ? h('div', { class: ['ui-modal-root', props.wrapClassName, attrs.class] }, [
      h('div', { class: 'ui-modal-mask', onClick: cancel }),
      h('section', {
        class: 'ui-modal',
        style: [
          {
            width: typeof props.width === 'number' ? `${props.width}px` : props.width,
            height: props.height ? (typeof props.height === 'number' ? `${props.height}px` : props.height) : undefined
          },
          attrs.style
        ]
      }, [
        h('header', { class: 'ui-modal-header' }, [
          h('h3', {}, props.title),
          h('button', { type: 'button', class: 'ui-modal-close', onClick: cancel }, '×')
        ]),
        h('div', { class: 'ui-modal-body', style: props.bodyStyle }, slotContent(slots)),
        h('footer', { class: 'ui-modal-footer' }, slots.footer ? slotContent(slots, 'footer') : [
          h(UiButton, { onClick: cancel }, () => props.cancelText),
          h(UiButton, {
            type: 'primary',
            danger: props.okButtonProps?.danger,
            disabled: props.okButtonProps?.disabled,
            loading: props.confirmLoading,
            onClick: () => emit('ok')
          }, () => props.okText)
        ])
      ])
    ]) : null;
  }
});

const UiAlert = defineComponent({
  name: 'UiAlert',
  props: {
    type: { type: String, default: 'info' },
    message: String,
    description: String,
    showIcon: Boolean
  },
  setup(props, { slots, attrs }) {
    return () => h('div', {
      ...attrs,
      class: ['ui-alert', `ui-alert-${props.type}`, attrs.class]
    }, [
      props.showIcon ? h('span', { class: 'ui-alert-icon' }, props.type === 'warning' ? '!' : 'i') : null,
      h('div', { class: 'ui-alert-content' }, [
        h('div', { class: 'ui-alert-message' }, slots.message ? slotContent(slots, 'message') : props.message),
        (slots.description || props.description) ? h('div', { class: 'ui-alert-description' },
          slots.description ? slotContent(slots, 'description') : props.description
        ) : null
      ])
    ]);
  }
});

const UiTooltip = defineComponent({
  name: 'UiTooltip',
  setup(_, { slots, attrs }) {
    return () => h('span', {
      ...attrs,
      class: ['ui-tooltip', attrs.class]
    }, slotContent(slots));
  }
});

const UiPopconfirm = defineComponent({
  name: 'UiPopconfirm',
  props: {
    title: String,
    okText: { type: String, default: '确定' },
    cancelText: { type: String, default: '取消' }
  },
  emits: ['confirm', 'cancel'],
  setup(props, { emit, slots }) {
    return () => h('span', {
      class: 'ui-popconfirm',
      onClick: (event) => {
        event.stopPropagation();
        openProgrammaticModal({
          title: '确认操作',
          content: props.title || '确认操作？',
          okText: props.okText,
          cancelText: props.cancelText,
          onOk: () => emit('confirm'),
          onCancel: () => emit('cancel')
        }, 'confirm');
      }
    }, slotContent(slots));
  }
});

const UiUploadDragger = defineComponent({
  name: 'UiUploadDragger',
  props: {
    accept: String,
    multiple: Boolean,
    beforeUpload: Function,
    showUploadList: Boolean
  },
  setup(props, { slots, attrs }) {
    const inputRef = ref(null);

    function handleFiles(files) {
      Array.from(files || []).forEach(file => props.beforeUpload?.(file));
      if (inputRef.value) inputRef.value.value = '';
    }

    return () => h('div', {
      ...attrs,
      class: ['ui-upload-dragger', attrs.class],
      onClick: () => inputRef.value?.click(),
      onDragover: event => event.preventDefault(),
      onDrop: (event) => {
        event.preventDefault();
        handleFiles(event.dataTransfer.files);
      }
    }, [
      h('input', {
        ref: inputRef,
        type: 'file',
        accept: props.accept,
        multiple: props.multiple,
        class: 'ui-upload-input',
        onChange: event => handleFiles(event.target.files)
      }),
      slotContent(slots)
    ]);
  }
});

const UiEmpty = defineComponent({
  name: 'UiEmpty',
  props: {
    description: String
  },
  setup(props, { slots }) {
    return () => h('div', { class: 'ui-empty' }, [
      h('div', { class: 'ui-empty-mark' }, [
        h('svg', { viewBox: '0 0 48 48', width: 40, height: 40, fill: 'none', 'aria-hidden': 'true' }, [
          h('path', {
            d: 'M9 20.5 12.5 10h23L39 20.5V36a2 2 0 0 1-2 2H11a2 2 0 0 1-2-2V20.5Z',
            stroke: 'currentColor',
            'stroke-width': 2,
            'stroke-linejoin': 'round'
          }),
          h('path', {
            d: 'M9 22h9l1.8 3.6h8.4L30 22h9',
            stroke: 'currentColor',
            'stroke-width': 2,
            'stroke-linejoin': 'round'
          })
        ])
      ]),
      h('div', { class: 'ui-empty-description' }, props.description || '暂无数据'),
      slots.extra ? h('div', { class: 'ui-empty-extra' }, slotContent(slots, 'extra')) : null
    ]);
  }
});

const UiTypographyText = defineComponent({
  name: 'UiTypographyText',
  setup(_, { slots, attrs }) {
    return () => h('span', attrs, slotContent(slots));
  }
});

const UiDivider = defineComponent({
  name: 'UiDivider',
  setup(_, { attrs }) {
    return () => h('hr', { ...attrs, class: ['ui-divider', attrs.class] });
  }
});

const registry = {
  AButton: UiButton,
  ASpace: UiSpace,
  ATag: UiTag,
  ACard: UiCard,
  ATable: UiTable,
  ACollapse: UiCollapse,
  ACollapsePanel: UiCollapsePanel,
  AInput: UiInput,
  ATextarea: UiTextarea,
  AInputNumber: UiInputNumber,
  AAutoComplete: UiAutoComplete,
  ASwitch: UiSwitch,
  ARadioGroup: UiRadioGroup,
  ARadioButton: UiRadioButton,
  ARadio: UiRadio,
  AForm: UiForm,
  AFormItem: UiFormItem,
  AModal: UiModal,
  AAlert: UiAlert,
  ATooltip: UiTooltip,
  APopconfirm: UiPopconfirm,
  AUploadDragger: UiUploadDragger,
  AEmpty: UiEmpty,
  ATypographyText: UiTypographyText,
  ADivider: UiDivider,
  ACheckbox: UiCheckbox
};

export function installLocalUi(app) {
  Object.entries(registry).forEach(([name, component]) => {
    app.component(name, component);
  });
}

function ensureMessageHost() {
  if (typeof document === 'undefined') return null;
  let host = document.querySelector('.ui-message-host');
  if (!host) {
    host = document.createElement('div');
    host.className = 'ui-message-host';
    document.body.appendChild(host);
  }
  return host;
}

function showMessage(type, content, duration = 3) {
  const host = ensureMessageHost();
  if (!host) {
    console[type === 'error' ? 'error' : 'log'](content);
    return;
  }

  const item = document.createElement('div');
  item.className = `ui-message ui-message-${type}`;
  item.textContent = String(content);
  host.appendChild(item);

  window.setTimeout(() => {
    item.classList.add('ui-message-leave');
    window.setTimeout(() => item.remove(), 180);
  }, Math.max(1, Number(duration) || 3) * 1000);
}

export const message = {
  success: (content, duration) => showMessage('success', content, duration),
  error: (content, duration) => showMessage('error', content, duration),
  warning: (content, duration) => showMessage('warning', content, duration),
  info: (content, duration) => showMessage('info', content, duration)
};

function renderModalContent(content) {
  if (typeof content === 'string' || typeof content === 'number') return String(content);
  if (isVNode(content)) return content;
  return content ?? null;
}

function openProgrammaticModal(options, mode) {
  if (typeof document === 'undefined') {
    if (mode === 'confirm' && options.onOk) options.onOk();
    return;
  }

  const host = document.createElement('div');
  document.body.appendChild(host);
  const open = ref(true);
  const loading = ref(false);

  function close() {
    open.value = false;
    window.setTimeout(() => {
      app.unmount();
      host.remove();
    }, 0);
  }

  async function handleOk() {
    try {
      const result = options.onOk?.();
      if (isPromiseLike(result)) {
        loading.value = true;
        await result;
      }
      if (result !== false) close();
    } finally {
      loading.value = false;
    }
  }

  function handleCancel() {
    options.onCancel?.();
    close();
  }

  const ProgrammaticModal = defineComponent({
    name: 'ProgrammaticModal',
    setup() {
      return () => h(UiModal, {
        open: open.value,
        title: options.title,
        width: options.width || '520px',
        okText: options.okText || '确定',
        cancelText: options.cancelText || '取消',
        confirmLoading: loading.value,
        wrapClassName: options.wrapClassName,
        'onUpdate:open': (value) => { if (!value) close(); },
        onOk: handleOk,
        onCancel: handleCancel
      }, {
        default: () => h('div', { class: `ui-modal-${mode}-content` }, [renderModalContent(options.content)]),
        footer: mode === 'confirm'
          ? undefined
          : () => [h(UiButton, { type: 'primary', onClick: handleOk }, () => options.okText || '确定')]
      });
    }
  });

  const app = createApp(ProgrammaticModal);
  installLocalUi(app);
  app.mount(host);
}

export const Modal = {
  confirm: (options) => openProgrammaticModal(options || {}, 'confirm'),
  info: (options) => openProgrammaticModal(options || {}, 'info'),
  warning: (options) => openProgrammaticModal(options || {}, 'warning')
};

export const Checkbox = UiCheckbox;
