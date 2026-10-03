import {
  isGroup,
  fieldType,
  operatorsFor,
  needsValue,
  type Condition,
  type ConditionGroup,
  type DataSource,
  type FieldDef,
  type LogicalOperator,
  type Operator,
} from '../../lib/query-builder';

export interface GroupActions {
  updateCondition: (id: string, updates: Partial<Condition>) => void;
  remove: (id: string) => void;
  addCondition: (groupId: string) => void;
  addGroup: (groupId: string) => void;
  setOperator: (groupId: string, operator: LogicalOperator) => void;
}

interface Props {
  group: ConditionGroup;
  dataSource: DataSource;
  fields: FieldDef[];
  actions: GroupActions;
  depth?: number;
  /** Set for nested groups so they can be removed. */
  isNested?: boolean;
}

const inputClass = 'px-2 py-1 border border-slate-300 rounded text-sm';

function RemoveButton({ title, onClick, className = '' }: { title: string; onClick: () => void; className?: string }) {
  return (
    <button
      onClick={onClick}
      className={`p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded ${className}`}
      title={title}
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  );
}

function ConditionRow({
  condition,
  dataSource,
  fields,
  actions,
}: {
  condition: Condition;
  dataSource: DataSource;
  fields: FieldDef[];
  actions: GroupActions;
}) {
  const type = fieldType(dataSource, condition.field);
  const operators = operatorsFor(type);
  const update = (updates: Partial<Condition>) => actions.updateCondition(condition.id, updates);

  const valueInputProps = {
    type: type === 'date' ? 'date' : 'text',
    inputMode: type === 'number' ? ('decimal' as const) : undefined,
  };

  return (
    <div className="flex items-center gap-2 flex-wrap p-2 bg-slate-50 rounded-lg">
      <select
        value={condition.field}
        onChange={(e) => update({ field: e.target.value, operator: operatorsFor(fieldType(dataSource, e.target.value))[0]?.value ?? 'contains' })}
        className={`${inputClass} bg-white min-w-[160px]`}
      >
        {fields.map((f) => (
          <option key={f.value} value={f.value}>{f.label}</option>
        ))}
      </select>

      <select
        value={condition.operator}
        onChange={(e) => update({ operator: e.target.value as Operator })}
        className={`${inputClass} bg-white min-w-[140px]`}
      >
        {operators.map((op) => (
          <option key={op.value} value={op.value}>{op.label}</option>
        ))}
      </select>

      {needsValue(condition.operator) && (
        <input
          {...valueInputProps}
          value={condition.value}
          onChange={(e) => update({ value: e.target.value })}
          placeholder={condition.operator === 'in_list' ? 'value1, value2, ...' : 'Enter value...'}
          className={`${inputClass} flex-1 min-w-[150px]`}
        />
      )}

      {condition.operator === 'between' && (
        <>
          <span className="text-slate-500">and</span>
          <input
            {...valueInputProps}
            value={condition.value2 || ''}
            onChange={(e) => update({ value2: e.target.value })}
            className={`${inputClass} min-w-[120px]`}
          />
        </>
      )}

      <RemoveButton title="Remove condition" onClick={() => actions.remove(condition.id)} />
    </div>
  );
}

export default function ConditionGroupEditor({ group, dataSource, fields, actions, depth = 0, isNested = false }: Props) {
  return (
    <div className={`${depth % 2 === 0 ? 'bg-white' : 'bg-blue-50'} border border-slate-200 rounded-lg p-3 ${depth > 0 ? 'ml-4' : ''}`}>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm font-medium text-slate-700">Match</span>
        <select
          value={group.logicalOperator}
          onChange={(e) => actions.setOperator(group.id, e.target.value as LogicalOperator)}
          className={`${inputClass} bg-white font-medium`}
        >
          <option value="AND">ALL (AND)</option>
          <option value="OR">ANY (OR)</option>
        </select>
        <span className="text-sm text-slate-500">of the following conditions:</span>

        {isNested && <RemoveButton title="Remove group" onClick={() => actions.remove(group.id)} className="ml-auto" />}
      </div>

      <div className="space-y-2">
        {group.conditions.map((item) =>
          isGroup(item) ? (
            <ConditionGroupEditor
              key={item.id}
              group={item}
              dataSource={dataSource}
              fields={fields}
              actions={actions}
              depth={depth + 1}
              isNested
            />
          ) : (
            <ConditionRow key={item.id} condition={item} dataSource={dataSource} fields={fields} actions={actions} />
          )
        )}
      </div>

      <div className="flex gap-2 mt-3 pt-3 border-t border-slate-200">
        <button
          onClick={() => actions.addCondition(group.id)}
          className="px-3 py-1 text-sm text-nc-blue hover:bg-blue-50 rounded-lg border border-nc-blue"
        >
          + Add Condition
        </button>
        <button
          onClick={() => actions.addGroup(group.id)}
          className="px-3 py-1 text-sm text-slate-600 hover:bg-slate-100 rounded-lg border border-slate-300"
        >
          + Add Group
        </button>
      </div>
    </div>
  );
}
