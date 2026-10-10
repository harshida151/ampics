'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { LogoMark } from '@/components/icons';
import { Button, ErrorNotice, Field, PageLoading } from '@/components/ui';
import * as api from '@/lib/api';
import { cx } from '@/lib/cx';
import { homeFor } from '@/lib/roles';

type Mode = 'signin' | 'signup';
type Errors = Partial<Record<'fullName' | 'enrolmentNo' | 'email' | 'password', string>>;

export default function LoginPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [mode, setMode] = useState<Mode>('signin');
  const [busy, setBusy] = useState(false);
  const [apiError, setApiError] = useState<unknown>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [fullName, setFullName] = useState('');
  const [enrolmentNo, setEnrolmentNo] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    api
      .getCurrentUser()
      .then((u) => (u ? router.replace(homeFor(u.role)) : setChecking(false)))
      .catch(() => setChecking(false));
  }, [router]);

  function validate(): Errors {
    const e: Errors = {};
    if (mode === 'signup') {
      if (fullName.trim().length < 2) e.fullName = 'Enter your full name as it appears on your student record.';
      if (!/^[A-Za-z0-9/-]{4,20}$/.test(enrolmentNo.trim())) e.enrolmentNo = 'Enter 4 to 20 letters or numbers, for example EN2021045.';
    }
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) e.email = 'Enter a full email address, like name@college.edu.';
    if (mode === 'signup' ? password.length < 8 : password.length === 0) {
      e.password = mode === 'signup' ? 'Use at least 8 characters.' : 'Enter your password.';
    }
    return e;
  }

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    setApiError(null);
    const e = validate();
    setErrors(e);
    const first = (['fullName', 'enrolmentNo', 'email', 'password'] as const).find((k) => e[k]);
    if (first) {
      document.getElementById(first)?.focus();
      return;
    }
    setBusy(true);
    try {
      if (mode === 'signin') {
        const u = await api.login(email, password);
        router.replace(homeFor(u.role));
      } else {
        await api.register({ fullName, enrolmentNo, email, password });
        router.replace('/enroll');
      }
    } catch (err) {
      setApiError(err);
      setBusy(false);
    }
  }

  if (checking) return <PageLoading />;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <div className="mb-6 flex items-center gap-3">
        <LogoMark className="h-10 w-10" />
        <div>
          <h1 className="text-2xl font-semibold leading-tight">ClassCheck</h1>
          <p className="text-muted">Attendance that proves who and where you are.</p>
        </div>
      </div>

      <div className="card p-5">
        <div role="tablist" aria-label="Sign in or create account" className="mb-5 grid grid-cols-2 gap-1 rounded-lg bg-paper p-1">
          {(['signin', 'signup'] as Mode[]).map((m) => (
            <button
              key={m}
              role="tab"
              type="button"
              id={`tab-${m}`}
              aria-selected={mode === m}
              aria-controls="auth-panel"
              onClick={() => {
                setMode(m);
                setErrors({});
                setApiError(null);
              }}
              className={cx('min-h-[44px] rounded-md px-3 font-medium', mode === m ? 'bg-surface text-ink shadow-sm ring-1 ring-line' : 'text-muted hover:text-ink')}
            >
              {m === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          ))}
        </div>

        <form id="auth-panel" role="tabpanel" aria-labelledby={`tab-${mode}`} onSubmit={onSubmit} noValidate className="space-y-4">
          {mode === 'signup' && (
            <>
              <Field id="fullName" label="Full name" autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} error={errors.fullName} />
              <Field
                id="enrolmentNo"
                label="Enrolment number"
                autoComplete="off"
                autoCapitalize="characters"
                value={enrolmentNo}
                onChange={(e) => setEnrolmentNo(e.target.value)}
                error={errors.enrolmentNo}
              />
            </>
          )}
          <Field id="email" label="Email" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} />
          <Field
            id="password"
            label="Password"
            type="password"
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={errors.password}
            hint={mode === 'signup' ? 'At least 8 characters.' : undefined}
          />
          {apiError != null && <ErrorNotice error={apiError} />}
          <Button type="submit" busy={busy} className="w-full">
            {mode === 'signin' ? 'Sign in' : 'Create account'}
          </Button>
        </form>

        <div className="mt-6 border-t border-line pt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Quick 1-Click Demo Login</p>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={async () => {
                setBusy(true);
                try {
                  const u = await api.quickLogin('student');
                  router.replace(homeFor(u.role));
                } catch (err) {
                  setApiError(err);
                  setBusy(false);
                }
              }}
              className="rounded-md border border-line bg-surface px-2 py-2 text-center text-xs font-medium text-ink transition hover:border-brand-text hover:bg-paper"
            >
              🎓 Student
            </button>
            <button
              type="button"
              onClick={async () => {
                setBusy(true);
                try {
                  const u = await api.quickLogin('instructor');
                  router.replace(homeFor(u.role));
                } catch (err) {
                  setApiError(err);
                  setBusy(false);
                }
              }}
              className="rounded-md border border-line bg-surface px-2 py-2 text-center text-xs font-medium text-ink transition hover:border-brand-text hover:bg-paper"
            >
              👨‍🏫 Instructor
            </button>
            <button
              type="button"
              onClick={async () => {
                setBusy(true);
                try {
                  const u = await api.quickLogin('admin');
                  router.replace(homeFor(u.role));
                } catch (err) {
                  setApiError(err);
                  setBusy(false);
                }
              }}
              className="rounded-md border border-line bg-surface px-2 py-2 text-center text-xs font-medium text-ink transition hover:border-brand-text hover:bg-paper"
            >
              🛡️ Admin
            </button>
          </div>
        </div>
      </div>

    </main>
  );
}
