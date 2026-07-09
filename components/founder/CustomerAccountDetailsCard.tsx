'use client';

import { useActionState, useEffect, useMemo, useState } from 'react';
import { FounderBadge } from './FounderShell';

export type CustomerAccountDetailsActionState = {
  ok?: boolean;
  message?: string;
  error?: string;
};

type CustomerAccountDetails = {
  id: string;
  companyName: string;
  domain: string;
  industry: string | null;
  planTier: string;
  status: string;
  seatLimit: number;
  dataRetentionDays: number;
  primaryAdminName: string | null;
  primaryAdminEmail: string;
  createdAt: string;
  updatedAt: string;
};

type CustomerAccountDetailsCardProps = {
  customer: CustomerAccountDetails;
  canEdit: boolean;
  saveAction: (state: CustomerAccountDetailsActionState, formData: FormData) => Promise<CustomerAccountDetailsActionState>;
};

const planOptions = [
  ['FREE_TRIAL', 'Free Trial'],
  ['STARTER', 'Starter'],
  ['GROWTH', 'Growth'],
  ['ENTERPRISE', 'Enterprise'],
];

const statusOptions = [
  ['TRIAL', 'Trial'],
  ['ACTIVE', 'Active'],
  ['SUSPENDED', 'Suspended'],
  ['CHURNED', 'Churned'],
];

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function Field({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">{label}</p>
      <p className="mt-2 break-words text-sm font-black text-slate-900">{value || 'Not set'}</p>
    </div>
  );
}

function TextInput({ label, name, defaultValue, type = 'text', disabled, required = false }: {
  label: string;
  name: string;
  defaultValue: string | number;
  type?: string;
  disabled: boolean;
  required?: boolean;
}) {
  return (
    <label className="grid gap-2 text-sm font-black text-slate-700">
      {label}
      <input
        className="min-h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-900 outline-none transition focus:border-[#2557dc] focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100"
        name={name}
        defaultValue={defaultValue}
        type={type}
        required={required}
        disabled={disabled}
      />
    </label>
  );
}

function SelectInput({ label, name, defaultValue, options, disabled }: {
  label: string;
  name: string;
  defaultValue: string;
  options: string[][];
  disabled: boolean;
}) {
  return (
    <label className="grid gap-2 text-sm font-black text-slate-700">
      {label}
      <select
        className="min-h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-900 outline-none transition focus:border-[#2557dc] focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100"
        name={name}
        defaultValue={defaultValue}
        disabled={disabled}
      >
        {options.map(([value, labelText]) => <option key={value} value={value}>{labelText}</option>)}
      </select>
    </label>
  );
}

export function CustomerAccountDetailsCard({ customer, canEdit, saveAction }: CustomerAccountDetailsCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [state, formAction, isPending] = useActionState(saveAction, {});

  useEffect(() => {
    if (state.ok) {
      setIsEditing(false);
      setIsDirty(false);
    }
  }, [state.ok]);

  useEffect(() => {
    if (!isDirty) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  const summary = useMemo(() => [
    ['Company Name', customer.companyName],
    ['Company Domain', customer.domain],
    ['Industry', customer.industry],
    ['Plan', customer.planTier.replace('_', ' ')],
    ['Status', customer.status],
    ['Seat Limit', customer.seatLimit],
    ['Data Retention Period', `${customer.dataRetentionDays} days`],
    ['Primary Admin Name', customer.primaryAdminName],
    ['Primary Admin Email', customer.primaryAdminEmail],
    ['Created Date', formatDate(customer.createdAt)],
    ['Last Updated Date', formatDate(customer.updatedAt)],
  ] as const, [customer]);

  const cancel = () => {
    if (isDirty && !window.confirm('You have unsaved changes. Discard changes?')) return;
    setIsEditing(false);
    setIsDirty(false);
  };

  return (
    <section id="customer-account-details" className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm scroll-mt-6" data-testid="customer-account-details">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2557dc]">Account Details</p>
          <h3 className="mt-2 text-2xl font-black text-slate-950">Customer account details</h3>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
            Founder-owned customer profile, billing limits, and primary administrator details.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FounderBadge tone={customer.status === 'ACTIVE' ? 'green' : customer.status === 'SUSPENDED' ? 'red' : 'amber'}>
            {customer.status}
          </FounderBadge>
          {!isEditing && canEdit ? (
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="rounded-xl bg-[#2557dc] px-4 py-3 text-sm font-black text-white shadow-sm transition hover:bg-blue-700"
            >
              Edit Account Details
            </button>
          ) : null}
        </div>
      </div>

      {!canEdit ? (
        <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">
          Account details are read-only for your current founder role. Super admins and founder admins can edit these fields.
        </div>
      ) : null}

      {state.ok && state.message ? (
        <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-800">
          {state.message}
        </div>
      ) : null}
      {state.error ? (
        <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-black text-rose-800">
          {state.error}
        </div>
      ) : null}

      {!isEditing ? (
        <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {summary.map(([label, value]) => <Field key={label} label={label} value={value} />)}
        </div>
      ) : (
        <form
          action={formAction}
          className="mt-6 grid gap-5"
          onChange={() => setIsDirty(true)}
          onSubmit={() => setIsDirty(false)}
        >
          <input type="hidden" name="customerAccountId" value={customer.id} />
          <div className="grid gap-4 md:grid-cols-2">
            <TextInput label="Company Name" name="companyName" defaultValue={customer.companyName} disabled={isPending} required />
            <TextInput label="Company Domain" name="domain" defaultValue={customer.domain} disabled={isPending} required />
            <TextInput label="Industry" name="industry" defaultValue={customer.industry ?? ''} disabled={isPending} />
            <SelectInput label="Plan" name="planTier" defaultValue={customer.planTier} options={planOptions} disabled={isPending} />
            <SelectInput label="Status" name="status" defaultValue={customer.status} options={statusOptions} disabled={isPending} />
            <TextInput label="Seat Limit" name="seatLimit" defaultValue={customer.seatLimit} type="number" disabled={isPending} required />
            <TextInput label="Data Retention Period (days)" name="dataRetentionDays" defaultValue={customer.dataRetentionDays} type="number" disabled={isPending} required />
            <TextInput label="Primary Admin Name" name="primaryAdminName" defaultValue={customer.primaryAdminName ?? ''} disabled={isPending} />
            <TextInput label="Primary Admin Email" name="primaryAdminEmail" defaultValue={customer.primaryAdminEmail} type="email" disabled={isPending} required />
          </div>
          <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={cancel}
              disabled={isPending}
              className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="rounded-xl bg-[#2557dc] px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isPending ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
