<script setup>
import { ref, computed, h, onMounted } from 'vue';
import {
    PlusOutlined,
    EditOutlined,
    DeleteOutlined,
    CheckOutlined,
    SettingOutlined,
    UserOutlined,
    WindowsOutlined,
    ExclamationCircleOutlined,
    DeploymentUnitOutlined,
    SearchOutlined,
    CopyOutlined
} from '@ant-design/icons-vue';
import { message, Modal } from 'ant-design-vue';
import { useGroupsStore } from '../stores/groups';
import { useAlternativesStore } from '../stores/alternatives';

const groupsStore = useGroupsStore();
const alternativesStore = useAlternativesStore();

const showGroupModal = ref(false);
const showSchemeModal = ref(false);
const editingGroup = ref(null);
const editingScheme = ref(null);
const currentGroupId = ref(null);

const groupForm = ref({
    name: '',
    scope: 'user',
    variables: []
});

const schemeForm = ref({
    name: '',
    values: {}
});

const newVarName = ref('');
const allEnvVars = ref([]);
const currentEnvVarValues = ref({}); // { name: value }
const searchText = ref('');

const filteredGroups = computed(() => {
    if (!searchText.value) return groupsStore.groups.value;
    const lower = searchText.value.toLowerCase();
    return groupsStore.groups.value.filter(g =>
        g.name.toLowerCase().includes(lower) ||
        g.variables.some(v => v.toLowerCase().includes(lower))
    );
});

// 获取所有现有的环境变量名和值
const fetchAllEnvVars = () => {
    try {
        const result = window.services.getEnvVars();
        const systemVars = result.systemVars || [];
        const userVars = result.userVars || [];

        const systemNames = systemVars.map(v => v.name);
        const userNames = userVars.map(v => v.name);

        // 合并并去重变量名
        allEnvVars.value = Array.from(new Set([...systemNames, ...userNames])).sort();

        // 存储当前值
        const values = {};
        [...systemVars, ...userVars].forEach(v => {
            values[v.name] = v.value;
        });
        currentEnvVarValues.value = values;
    } catch (error) {
        console.error('获取环境变量失败:', error);
    }
};

onMounted(() => {
    fetchAllEnvVars();
});

// 自动补全选项
const autoCompleteOptions = computed(() => {
    if (!newVarName.value) return [];
    const search = newVarName.value.toLowerCase();
    return allEnvVars.value
        .filter(name => name.toLowerCase().includes(search))
        .map(name => ({ value: name }));
});

// 获取某个变量的推荐值（当前值 + 备用值）
const getValueOptions = (varName, scope) => {
    const options = [];

    // 1. 当前值 (系统注册表中实际存在的值)
    const currentValue = currentEnvVarValues.value[varName];
    if (currentValue !== undefined) {
        options.push({
            value: currentValue,
            label: `[系统当前值] ${currentValue}`
        });
    }

    // 2. 备用值 (用户之前在主页保存过的历史记录)
    const alts = alternativesStore.getAlternatives(scope, varName);
    alts.forEach(alt => {
        if (alt.value !== currentValue) {
            const label = alt.note ? `[${alt.note}] ${alt.value}` : alt.value;
            options.push({
                value: alt.value,
                label: label
            });
        }
    });

    return options;
};

const isAdmin = ref(false);

// 检查管理员权限
const checkAdmin = async () => {
    try {
        isAdmin.value = window.services.checkAdminPrivileges();
    } catch (e) {
        isAdmin.value = false;
    }
};

checkAdmin();

const handleAddGroup = () => {
    fetchAllEnvVars();
    editingGroup.value = null;
    groupForm.value = {
        name: '',
        scope: 'user',
        variables: []
    };
    showGroupModal.value = true;
};

const handleEditGroup = (group) => {
    fetchAllEnvVars();
    editingGroup.value = group;
    groupForm.value = {
        name: group.name,
        scope: group.scope,
        variables: [...group.variables]
    };
    showGroupModal.value = true;
};

const handleDeleteGroup = (group) => {
    Modal.confirm({
        title: '确认删除',
        icon: h(ExclamationCircleOutlined),
        content: `确定要删除变量组 "${group.name}" 吗？`,
        onOk() {
            groupsStore.deleteGroup(group.id);
            message.success('删除成功');
        }
    });
};

const addVariableToGroup = (val) => {
    const name = (typeof val === 'string' ? val : newVarName.value).trim();
    if (!name) return;
    if (groupForm.value.variables.includes(name)) {
        message.warning('变量已存在');
        newVarName.value = '';
        return;
    }
    groupForm.value.variables.push(name);
    newVarName.value = '';
};

const removeVariableFromGroup = (name) => {
    groupForm.value.variables = groupForm.value.variables.filter(v => v !== name);
};

const saveGroup = () => {
    if (!groupForm.value.name) {
        message.warning('请输入组名');
        return;
    }
    if (groupForm.value.variables.length === 0) {
        message.warning('请至少添加一个变量');
        return;
    }

    if (editingGroup.value) {
        groupsStore.updateGroup(editingGroup.value.id, groupForm.value);
        message.success('更新成功');
    } else {
        groupsStore.addGroup(groupForm.value);
        message.success('添加成功');
    }
    showGroupModal.value = false;
};

const handleAddScheme = (groupId) => {
    fetchAllEnvVars();
    currentGroupId.value = groupId;
    editingScheme.value = null;
    const group = groupsStore.groups.value.find(g => g.id === groupId);
    editingGroup.value = group;
    const values = {};
    group.variables.forEach(v => {
        values[v] = '';
    });
    schemeForm.value = {
        name: '',
        values
    };
    showSchemeModal.value = true;
};

const handleEditScheme = (groupId, scheme) => {
    fetchAllEnvVars();
    currentGroupId.value = groupId;
    editingScheme.value = scheme;
    const group = groupsStore.groups.value.find(g => g.id === groupId);
    editingGroup.value = group;
    schemeForm.value = {
        name: scheme.name,
        values: { ...scheme.values }
    };
    showSchemeModal.value = true;
};

const handleDeleteScheme = (groupId, schemeId) => {
    Modal.confirm({
        title: '确认删除',
        content: '确定要删除这个方案吗？',
        onOk() {
            groupsStore.deleteScheme(groupId, schemeId);
            message.success('删除成功');
        }
    });
};

const handleCopyScheme = (groupId, scheme) => {
    const newScheme = {
        name: `${scheme.name} (1)`,
        values: { ...scheme.values }
    };
    groupsStore.addScheme(groupId, newScheme);
    message.success(`方案 "${scheme.name}" 已复制`);
};

const saveScheme = () => {
    if (!schemeForm.value.name) {
        message.warning('请输入方案名称');
        return;
    }

    if (editingScheme.value) {
        groupsStore.updateScheme(currentGroupId.value, editingScheme.value.id, schemeForm.value);
        message.success('更新成功');
    } else {
        groupsStore.addScheme(currentGroupId.value, schemeForm.value);
        message.success('添加成功');
    }
    showSchemeModal.value = false;
};

const applyScheme = async (group, scheme) => {
    const isSystem = group.scope === 'system';
    if (isSystem && !isAdmin.value) {
        message.error('修改系统变量需要管理员权限');
        return;
    }

    try {
        const promises = Object.entries(scheme.values).map(([name, value]) => {
            return window.services.setEnvVar(name, value, isSystem);
        });

        await Promise.all(promises);

        groupsStore.updateGroup(group.id, { activeSchemeId: scheme.id });
        message.success(`变量组 "${group.name}" 已切换至方案 "${scheme.name}"`);
    } catch (error) {
        message.error(`应用失败: ${error.message}`);
    }
};
</script>

<template>
    <div class="group-view">
        <div class="toolbar">
            <a-space>
                <a-button type="primary" @click="handleAddGroup">
                    <PlusOutlined /> 添加变量组
                </a-button>
                <a-input v-model:value="searchText" placeholder="搜索变量组..." allowClear style="width: 200px">
                    <template #prefix>
                        <SearchOutlined />
                    </template>
                </a-input>
            </a-space>
        </div>

        <div class="groups-container">
            <div v-if="filteredGroups.length === 0" class="empty-container">
                <a-empty :description="searchText ? '未找到匹配的变量组' : '暂无变量组'">
                    <template #extra>
                        <p v-if="!searchText" class="empty-tip">您可以点击左上角的“添加变量组”来管理一组相关的环境变量</p>
                        <a-button v-if="!searchText" type="primary" @click="handleAddGroup">立即创建</a-button>
                    </template>
                </a-empty>
            </div>

            <a-card v-for="group in filteredGroups" :key="group.id" class="group-card" size="small">
                <template #title>
                    <div class="group-title">
                        <span class="name">{{ group.name }}</span>
                        <a-tag :color="group.scope === 'system' ? 'orange' : 'blue'">
                            <WindowsOutlined v-if="group.scope === 'system'" />
                            <UserOutlined v-else />
                            {{ group.scope === 'system' ? '系统' : '用户' }}
                        </a-tag>
                    </div>
                </template>
                <template #extra>
                    <a-space>
                        <a-button type="link" size="small" @click="handleEditGroup(group)">
                            <EditOutlined />
                        </a-button>
                        <a-button type="link" size="small" danger @click="handleDeleteGroup(group)">
                            <DeleteOutlined />
                        </a-button>
                    </a-space>
                </template>

                <div class="group-content">
                    <div class="variables-list">
                        <span class="label">包含变量：</span>
                        <a-tag v-for="v in group.variables" :key="v">{{ v }}</a-tag>
                    </div>

                    <div class="schemes-section">
                        <div class="section-header">
                            <span class="label">方案列表：</span>
                            <a-button size="small" @click="handleAddScheme(group.id)">
                                <PlusOutlined /> 添加方案
                            </a-button>
                        </div>

                        <div v-if="group.schemes.length === 0" class="empty-schemes">
                            <p>还没有方案哦</p>
                        </div>
                        <a-table v-else :dataSource="group.schemes" :pagination="false" size="small" rowKey="id"
                            :columns="[
                                { title: '方案名称', dataIndex: 'name', key: 'name' },
                                { title: '操作', key: 'actions', width: 180 }
                            ]">
                            <template #bodyCell="{ column, record }">
                                <template v-if="column.key === 'name'">
                                    <span>{{ record.name }}</span>
                                    <a-tag v-if="group.activeSchemeId === record.id" color="success"
                                        style="margin-left: 8px;">
                                        <CheckOutlined /> 当前
                                    </a-tag>
                                </template>
                                <template v-else-if="column.key === 'actions'">
                                    <a-space>
                                        <a-button type="primary" size="small"
                                            :disabled="group.activeSchemeId === record.id"
                                            @click="applyScheme(group, record)">
                                            应用
                                        </a-button>
                                        <a-button size="small" @click="handleEditScheme(group.id, record)">
                                            <EditOutlined />
                                        </a-button>
                                        <a-button size="small" @click="handleCopyScheme(group.id, record)" title="复制方案">
                                            <CopyOutlined />
                                        </a-button>
                                        <a-button size="small" danger @click="handleDeleteScheme(group.id, record.id)">
                                            <DeleteOutlined />
                                        </a-button>
                                    </a-space>
                                </template>
                            </template>
                        </a-table>
                    </div>
                </div>
            </a-card>
        </div>

        <!-- 变量组弹窗 -->
        <a-modal v-model:open="showGroupModal" :title="editingGroup ? '编辑变量组' : '添加变量组'" @ok="saveGroup">
            <a-form layout="vertical">
                <a-form-item label="组名" required>
                    <a-input v-model:value="groupForm.name" placeholder="例如：Claude 账号" />
                </a-form-item>
                <a-form-item label="作用域">
                    <a-radio-group v-model:value="groupForm.scope">
                        <a-radio value="user">用户变量</a-radio>
                        <a-radio value="system">系统变量</a-radio>
                    </a-radio-group>
                </a-form-item>
                <a-form-item label="变量列表 (可以多个变量)" required>
                    <div class="var-input-group">
                        <a-auto-complete v-model:value="newVarName" :options="autoCompleteOptions"
                            placeholder="输入变量名或从列表选择" style="flex: 1" @select="addVariableToGroup">
                            <a-input @pressEnter="addVariableToGroup">
                                <template #suffix>
                                    <SearchOutlined style="color: rgba(0, 0, 0, 0.25)" />
                                </template>
                            </a-input>
                        </a-auto-complete>
                        <a-button @click="addVariableToGroup">添加</a-button>
                    </div>
                    <div class="var-tags">
                        <a-tag v-for="v in groupForm.variables" :key="v" closable @close="removeVariableFromGroup(v)">
                            {{ v }}
                        </a-tag>
                    </div>
                </a-form-item>
            </a-form>
        </a-modal>

        <!-- 方案弹窗 -->
        <a-modal v-model:open="showSchemeModal" :title="editingScheme ? '编辑方案' : '添加方案'" @ok="saveScheme">
            <a-form layout="vertical">
                <a-form-item label="方案名称" required>
                    <a-input v-model:value="schemeForm.name" placeholder="例如：个人账号" />
                </a-form-item>
                <div v-for="v in Object.keys(schemeForm.values)" :key="v">
                    <a-form-item :label="v">
                        <a-auto-complete v-model:value="schemeForm.values[v]"
                            :options="getValueOptions(v, editingGroup?.scope || 'user')" placeholder="输入值或从现有配置选择"
                            style="width: 100%">
                            <a-textarea v-model:value="schemeForm.values[v]" :rows="2" />
                        </a-auto-complete>
                    </a-form-item>
                </div>
            </a-form>
        </a-modal>
    </div>
</template>

<style scoped>
.group-view {
    padding: 16px;
    height: 100%;
    overflow-y: auto;
}

.toolbar {
    margin-bottom: 16px;
}

.groups-container {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(450px, 1fr));
    gap: 16px;
    align-items: stretch;
}

.empty-container {
    grid-column: 1 / -1;
    padding: 40px 0;
    text-align: center;
}

.empty-tip {
    color: var(--ant-text-color-secondary);
    margin-bottom: 16px;
}

.group-card {
    border-radius: 8px;
    display: flex;
    border: 2px solid var(--blue);
    flex-direction: column;
}

:deep(.ant-card-body) {
    flex: 1;
    display: flex;
    flex-direction: column;
}

.group-title {
    display: flex;
    align-items: center;
    gap: 8px;
}

.group-title .name {
    font-weight: bold;
}

.group-content {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.variables-list {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px;
}

.label {
    font-weight: 500;
    color: var(--ant-text-color-secondary);
}

.schemes-section {
    border-top: 1px solid var(--ant-border-color-split);
    padding-top: 12px;
}

.section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
}

.empty-schemes {
    padding: 20px;
    text-align: center;
    border-radius: 4px;
    color: grey;
    border: 1px dashed var(--ant-border-color-split);
}

.var-input-group {
    display: flex;
    gap: 8px;
    margin-bottom: 8px;
}

.var-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
}
</style>
