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

const inputClass = 'input w-auto py-1.5';

function RemoveButton({ title, onClick, className = '' }: { title: string; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 ${className}`}
      title={title}
      aria-label={title}
    >
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
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
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-2">
      <select
        value={condition.field}
        onChange={(e) => update({ field: e.target.value, operator: operatorsFor(fieldType(dataSource, e.target.value))[0]?.value ?? 'contains' })}
        aria-label="Field"
        className={`${inputClass} min-w-[160px]`}
      >
        {fields.map((f) => (
          <option key={f.value} value={f.value}>{f.label}</option>
        ))}
      </select>

      <select
        value={condition.operator}
        onChange={(e) => update({ operator: e.target.value as Operator })}
        aria-label="Operator"
        className={`${inputClass} min-w-[140px]`}
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
          placeholder={condition.operator === 'in_list' ? 'value1, value2, …' : 'Value'}
          aria-label="Value"
          className={`${inputClass} min-w-[150px] flex-1`}
        />
      )}

      {condition.operator === 'between' && (
        <>
          <span className="text-slate-500">and</span>
          <input
            {...valueInputProps}
            value={condition.value2 || ''}
            onChange={(e) => update({ value2: e.target.value })}
            aria-label="Upper value"
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
    <div className={`rounded-lg border p-3 ${depth % 2 === 0 ? 'border-slate-200 bg-slate-50' : 'border-blue-200 bg-nc-blue-light/60'} ${depth > 0 ? 'ml-2 sm:ml-4' : ''}`}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-slate-700">Match</span>
        <select
          value={group.logicalOperator}
          onChange={(e) => actions.setOperator(group.id, e.target.value as LogicalOperator)}
          aria-label="Combine conditions with"
          className={`${inputClass} font-medium`}
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

      <div className="mt-3 flex gap-2">
        <button type="button" onClick={() => actions.addCondition(group.id)} className="btn-secondary btn-sm">
          + Condition
        </button>
        <button type="button" onClick={() => actions.addGroup(group.id)} className="btn-ghost btn-sm">
          + Group
        </button>
      </div>
    </div>
  );
}
