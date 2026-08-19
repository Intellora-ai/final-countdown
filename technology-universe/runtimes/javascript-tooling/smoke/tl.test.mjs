// @vitest-environment jsdom
import { test, expect } from 'vitest';
import { screen, getByRole } from '@testing-library/dom';
import { render } from '@testing-library/react';
import React from 'react';

test('testing-library/dom queries a real DOM node', () => {
  document.body.innerHTML = '<button>Press me</button>';
  const btn = getByRole(document.body, 'button', { name: 'Press me' });
  expect(btn.tagName).toBe('BUTTON');
});

test('react testing library renders a component', () => {
  render(React.createElement('h1', null, 'Registry RTL smoke'));
  expect(screen.getByRole('heading', { name: 'Registry RTL smoke' })).toBeTruthy();
});
