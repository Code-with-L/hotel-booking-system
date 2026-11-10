/** Accessible form controls with consistent error states. */

function Wrapper({ id, label, error, hint, children, className = "" }) {
  return (
    <div className={`field ${error ? "has-error" : ""} ${className}`.trim()}>
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && !error && <p className="field__hint">{hint}</p>}
      {error && (
        <p id={`${id}-error`} className="field__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

const aria = (id, error) => ({
  id,
  "aria-invalid": error ? "true" : undefined,
  "aria-describedby": error ? `${id}-error` : undefined,
});

export function TextField({ id, label, error, hint, className, inputRef, ...input }) {
  return (
    <Wrapper id={id} label={label} error={error} hint={hint} className={className}>
      <input ref={inputRef} {...aria(id, error)} {...input} />
    </Wrapper>
  );
}

export function TextAreaField({ id, label, error, hint, className, ...input }) {
  return (
    <Wrapper id={id} label={label} error={error} hint={hint} className={className}>
      <textarea {...aria(id, error)} {...input} />
    </Wrapper>
  );
}

export function SelectField({ id, label, error, hint, options, placeholder, className, ...input }) {
  return (
    <Wrapper id={id} label={label} error={error} hint={hint} className={className}>
      <select {...aria(id, error)} {...input}>
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => {
          const value = typeof o === "string" ? o : o.value;
          const text = typeof o === "string" ? o : o.label;
          return (
            <option key={value} value={value}>
              {text}
            </option>
          );
        })}
      </select>
    </Wrapper>
  );
}

export function CheckField({ id, children, error, ...input }) {
  return (
    <div className={`check ${error ? "has-error" : ""}`}>
      <input type="checkbox" {...aria(id, error)} {...input} />
      <label htmlFor={id}>{children}</label>
      {error && (
        <p id={`${id}-error`} className="field__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
