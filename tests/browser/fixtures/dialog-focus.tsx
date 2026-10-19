import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Dialog,
  SelectField,
  TextAreaField,
  TextField,
} from '../../../src/ledgerly/ui/components/primitives';

function Harness() {
  const [open, setOpen] = useState(true);
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [password, setPassword] = useState('');
  const [network, setNetwork] = useState('test');
  const [closedWith, setClosedWith] = useState('');
  const autofocus = new URLSearchParams(window.location.search).has('autofocus');

  return (
    <>
      <button onClick={() => setOpen(true)}>Open dialog</button>
      <output data-testid="closed-with">{closedWith}</output>
      {open ? (
        <Dialog
          title="Typing regression"
          onClose={() => {
            setClosedWith(name);
            setOpen(false);
          }}
        >
          <TextField
            label="Name"
            value={name}
            autoFocus={autofocus}
            onChange={(event) => setName(event.target.value)}
          />
          <TextAreaField
            label="Notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
          <TextField
            label="Password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <SelectField
            label="Network"
            value={network}
            onChange={(event) => setNetwork(event.target.value)}
          >
            <option value="test">Test</option>
            <option value="main">Main</option>
          </SelectField>
        </Dialog>
      ) : null}
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Harness />
  </StrictMode>,
);
