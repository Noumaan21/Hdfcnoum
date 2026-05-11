import { createOptimizedPicture } from '../../scripts/aem.js';
import transferRepeatableDOM, { insertAddButton, insertRemoveButton, createButton as createRepeatButton } from './components/repeat/repeat.js';
import { emailPattern, getSubmitBaseUrl, SUBMISSION_SERVICE } from './constant.js';
import GoogleReCaptcha from './integrations/recaptcha.js';
import componentDecorator from './mappings.js';
import { handleSubmit } from './submit.js';
import DocBasedFormToAF from './transform.js';
import {
  checkValidation,
  createButton,
  createDropdownUsingEnum,
  createFieldWrapper,
  createHelpText,
  createLabel,
  createRadioOrCheckboxUsingEnum,
  extractIdFromUrl,
  getHTMLRenderType,
  getSitePageName,
  setConstraints,
  setPlaceholder,
  stripTags,
  createRadioOrCheckbox,
  createInput,
} from './util.js';

export const DELAY_MS = 0;
let captchaField;
let afModule;
let otpTimerInterval = null;

const withFieldWrapper = (element) => (fd) => {
  const wrapper = createFieldWrapper(fd);
  wrapper.append(element(fd));
  return wrapper;
};

const createTextArea = withFieldWrapper((fd) => {
  const input = document.createElement('textarea');
  setPlaceholder(input, fd);
  return input;
});

const createSelect = withFieldWrapper((fd) => {
  const select = document.createElement('select');
  createDropdownUsingEnum(fd, select);
  return select;
});

function createHeading(fd) {
  const wrapper = createFieldWrapper(fd);
  const heading = document.createElement('h2');
  heading.textContent = fd.value || fd.label.value;
  heading.id = fd.id;
  wrapper.append(heading);

  return wrapper;
}

function createLegend(fd) {
  return createLabel(fd, 'legend');
}

function createRepeatablePanel(wrapper, fd) {
  setConstraints(wrapper, fd);
  wrapper.dataset.repeatable = true;
  wrapper.dataset.index = fd.index || 0;
  if (fd.properties) {
    Object.keys(fd.properties).forEach((key) => {
      if (!key.startsWith('fd:')) {
        wrapper.dataset[key] = fd.properties[key];
      }
    });
  }
  if ((!fd.index || fd?.index === 0) && fd.properties?.variant !== 'noButtons') {
    insertAddButton(wrapper, wrapper);
    insertRemoveButton(wrapper, wrapper);
  }
}

function createFieldSet(fd) {
  const wrapper = createFieldWrapper(fd, 'fieldset', createLegend);
  wrapper.id = fd.id;
  wrapper.name = fd.name;
  if (fd.fieldType === 'panel') {
    wrapper.classList.add('panel-wrapper');
  }
  if (fd.repeatable === true) {
    createRepeatablePanel(wrapper, fd);
  }
  return wrapper;
}

function setConstraintsMessage(field, messages = {}) {
  Object.keys(messages).forEach((key) => {
    field.dataset[`${key}ErrorMessage`] = messages[key];
  });
}

function createRadioOrCheckboxGroup(fd) {
  const wrapper = createFieldSet({ ...fd });
  createRadioOrCheckboxUsingEnum(fd, wrapper);
  wrapper.dataset.required = fd.required;
  if (fd.tooltip) {
    wrapper.title = stripTags(fd.tooltip, '');
  }
  setConstraintsMessage(wrapper, fd.constraintMessages);
  return wrapper;
}

function createPlainText(fd) {
  const paragraph = document.createElement('p');
  if (fd.richText) {
    paragraph.innerHTML = stripTags(fd.value);
  } else {
    paragraph.textContent = fd.value;
  }
  const wrapper = createFieldWrapper(fd);
  wrapper.id = fd.id;
  wrapper.replaceChildren(paragraph);
  return wrapper;
}

function createImage(fd) {
  const field = createFieldWrapper(fd);
  field.id = fd?.id;
  const imagePath = fd.value || fd.properties['fd:repoPath'] || '';
  const altText = fd.altText || fd.name;
  field.append(createOptimizedPicture(imagePath, altText));
  return field;
}

const fieldRenderers = {
  'drop-down': createSelect,
  'plain-text': createPlainText,
  checkbox: createRadioOrCheckbox,
  button: createButton,
  multiline: createTextArea,
  panel: createFieldSet,
  radio: createRadioOrCheckbox,
  'radio-group': createRadioOrCheckboxGroup,
  'checkbox-group': createRadioOrCheckboxGroup,
  image: createImage,
  heading: createHeading,
};

function colSpanDecorator(field, element) {
  const colSpan = field['Column Span'] || field.properties?.colspan;
  if (colSpan && element) {
    element.classList.add(`col-${colSpan}`);
  }
}

const handleFocus = (input, field) => {
  const editValue = input.getAttribute('edit-value');
  input.type = field.type;
  input.value = editValue;
};

const handleFocusOut = (input) => {
  const displayValue = input.getAttribute('display-value');
  input.type = 'text';
  input.value = displayValue;
};

function inputDecorator(field, element) {
  const input = element?.querySelector('input,textarea,select');
  if (input) {
    input.id = field.id;
    input.name = field.name;
    if (field.tooltip) {
      input.title = stripTags(field.tooltip, '');
    }
    input.readOnly = field.readOnly;
    input.autocomplete = field.autoComplete ?? 'off';
    input.disabled = field.enabled === false;
    if (field.fieldType === 'drop-down' && field.readOnly) {
      input.disabled = true;
    }
    const fieldType = getHTMLRenderType(field);
    if (['number', 'date', 'text', 'email'].includes(fieldType) && (field.displayFormat || field.displayValueExpression)) {
      field.type = fieldType;
      input.setAttribute('edit-value', field.value ?? '');
      input.setAttribute('display-value', field.displayValue ?? '');
      input.type = 'text';
      input.value = field.displayValue ?? '';
      // Handle mobile touch events to enable native date picker
      let isMobileTouch = false;
      input.addEventListener('touchstart', () => {
        isMobileTouch = true;
        input.type = field.type;
        // Set the edit value immediately to prevent empty field
        const editValue = input.getAttribute('edit-value');
        if (editValue) {
          input.value = editValue;
        }
      });

      input.addEventListener('focus', () => {
        // Only change type on desktop or if not already changed by touchstart
        if (!isMobileTouch && input.type !== field.type) {
          input.type = field.type;
        }
        handleFocus(input, field);
        // Reset mobile touch flag
        isMobileTouch = false;
      });
      input.addEventListener('blur', () => handleFocusOut(input));
    } else if (input.type !== 'file') {
      input.value = field.value ?? '';
      if (input.type === 'radio' || input.type === 'checkbox') {
        input.value = field?.enum?.[0] ?? 'on';
        input.checked = field.value === input.value;
      }
    } else {
      input.multiple = field.type === 'file[]';
    }
    if (field.required) {
      input.setAttribute('required', 'required');
    }
    if (field.description) {
      input.setAttribute('aria-describedby', `${field.id}-description`);
    }
    if (field.minItems) {
      input.dataset.minItems = field.minItems;
    }
    if (field.maxItems) {
      input.dataset.maxItems = field.maxItems;
    }
    if (field.maxFileSize) {
      input.dataset.maxFileSize = field.maxFileSize;
    }
    if (field.default !== undefined) {
      input.setAttribute('value', field.default);
    }
    if (input.type === 'email') {
      input.pattern = emailPattern;
    }
    setConstraintsMessage(element, field.constraintMessages);
    element.dataset.required = field.required;
  }
}

function decoratePanelContainer(panelDefinition, panelContainer) {
  if (!panelContainer) return;

  const isPanelWrapper = (container) => container.classList?.contains('panel-wrapper');

  const shouldAddLabel = (container, panel) => panel.label && !container.querySelector(`legend[for=${container.dataset.id}]`);

  if (isPanelWrapper(panelContainer)) {
    if (shouldAddLabel(panelContainer, panelDefinition)) {
      const legend = createLegend(panelDefinition);
      if (legend) {
        panelContainer.insertAdjacentElement('afterbegin', legend);
      }
    }

    const form = panelContainer.closest('form');
    const isEditMode = form && form.classList.contains('edit-mode');
    const isRepeatable = panelDefinition.repeatable === true || panelContainer.dataset.repeatable === 'true';

    if (isEditMode && isRepeatable) {
      const hasAddButton = panelContainer.querySelector('.repeat-actions .item-add');
      const hasRemoveButton = panelContainer.querySelector('.item-remove');

      if (!hasAddButton) {
        let repeatActions = panelContainer.querySelector('.repeat-actions');
        if (!repeatActions) {
          repeatActions = document.createElement('div');
          repeatActions.className = 'repeat-actions';
          const legend = panelContainer.querySelector('legend');
          if (legend) {
            legend.insertAdjacentElement('afterend', repeatActions);
          } else {
            panelContainer.insertAdjacentElement('afterbegin', repeatActions);
          }
        }
        const addButton = createRepeatButton('Add', 'add');
        repeatActions.appendChild(addButton);
      }

      if (!hasRemoveButton) {
        const removeButton = createRepeatButton('Delete', 'remove');
        panelContainer.appendChild(removeButton);
      }
    }
  }
}

function renderField(fd) {
  const fieldType = fd?.fieldType?.replace('-input', '') ?? 'text';
  const renderer = fieldRenderers[fieldType];
  let field;
  if (typeof renderer === 'function') {
    field = renderer(fd);
  } else {
    field = createFieldWrapper(fd);
    field.append(createInput(fd));
  }
  if (fd.description) {
    field.append(createHelpText(fd));
    field.dataset.description = fd.description; // In case overriden by error message
  }
  if (fd.fieldType !== 'radio-group' && fd.fieldType !== 'checkbox-group' && fd.fieldType !== 'captcha') {
    inputDecorator(fd, field);
  }
  return field;
}

export async function generateFormRendition(panel, container, formId, getItems = (p) => p?.items) {
  const items = getItems(panel) || [];
  const promises = items.map(async (field) => {
    field.value = field.value ?? '';
    const { fieldType } = field;
    if (fieldType === 'captcha') {
      captchaField = field;
      const element = createFieldWrapper(field);
      element.textContent = 'CAPTCHA';
      return element;
    }
    const element = renderField(field);
    if (field.appliedCssClassNames) {
      element.className += ` ${field.appliedCssClassNames}`;
    }
    colSpanDecorator(field, element);
    if (field?.fieldType === 'panel') {
      await generateFormRendition(field, element, formId, getItems);
      return element;
    }
    await componentDecorator(element, field, container, formId);
    return element;
  });

  const children = await Promise.all(promises);
  container.append(...children.filter((_) => _ != null));
  decoratePanelContainer(panel, container);
  await componentDecorator(container, panel, null, formId);
}

function enableValidation(form) {
  form.querySelectorAll('input,textarea,select').forEach((input) => {
    input.addEventListener('invalid', (event) => {
      checkValidation(event.target);
    });
  });

  form.addEventListener('change', (event) => {
    checkValidation(event.target);
  });
}

function isDocumentBasedForm(formDef) {
  return formDef?.[':type'] === 'sheet' && formDef?.data;
}

async function createFormForAuthoring(formDef) {
  const form = document.createElement('form');
  await generateFormRendition(formDef, form, formDef.id, (container) => {
    if (container[':itemsOrder'] && container[':items']) {
      return container[':itemsOrder'].map((itemKey) => container[':items'][itemKey]);
    }
    return [];
  });
  return form;
}

export async function createForm(formDef, data, source = 'aem') {
  const { action: formPath } = formDef;
  const form = document.createElement('form');
  form.dataset.action = formPath;
  form.dataset.source = source;
  form.noValidate = true;
  if (formDef.appliedCssClassNames) {
    form.className = formDef.appliedCssClassNames;
  }
  const formId = extractIdFromUrl(formPath); // formDef.id returns $form after getState()
  await generateFormRendition(formDef, form, formId);

  let captcha;
  if (captchaField) {
    let config = captchaField?.properties?.['fd:captcha']?.config;
    if (!config) {
      config = {
        siteKey: captchaField?.value,
        uri: captchaField?.uri,
        version: captchaField?.version,
      };
    }
    const pageName = getSitePageName(captchaField?.properties?.['fd:path']);
    captcha = new GoogleReCaptcha(config, captchaField.id, captchaField.name, pageName);
    captcha.loadCaptcha(form);
  }

  enableValidation(form);
  transferRepeatableDOM(form, formDef, form, formId);

  if (afModule && typeof Worker === 'undefined') {
    window.setTimeout(async () => {
      afModule.loadRuleEngine(formDef, form, captcha, generateFormRendition, data);
    }, DELAY_MS);
  }

  form.addEventListener('reset', async () => {
    const response = await createForm(formDef);
    if (response?.form) {
      document.querySelector(`[data-action="${form?.dataset?.action}"]`)?.replaceWith(response?.form);
    }
  });

  form.addEventListener('submit', (e) => {
    handleSubmit(e, form, captcha);
  });

  return {
    form,
    captcha,
    generateFormRendition,
    data,
  };
}

function cleanUp(content) {
  const formDef = content.replaceAll('^(([^<>()\\\\[\\\\]\\\\\\\\.,;:\\\\s@\\"]+(\\\\.[^<>()\\\\[\\\\]\\\\\\\\.,;:\\\\s@\\"]+)*)|(\\".+\\"))@((\\\\[[0-9]{1,3}\\\\.[0-9]{1,3}\\\\.[0-9]{1,3}\\\\.[0-9]{1,3}])|(([a-zA-Z\\\\-0-9]+\\\\.)\\+[a-zA-Z]{2,}))$', '');
  return formDef?.replace(/\x83\n|\n|\s\s+/g, '');
}
/*
  Newer Clean up - Replace backslashes that are not followed by valid json escape characters
  function cleanUp(content) {
    return content.replace(/\\/g, (match, offset, string) => {
      const prevChar = string[offset - 1];
      const nextChar = string[offset + 1];
      const validEscapeChars = ['b', 'f', 'n', 'r', 't', '"', '\\'];
      if (validEscapeChars.includes(nextChar) || prevChar === '\\') {
        return match;
      }
      return '';
    });
  }
*/

function decode(rawContent) {
  const content = rawContent.trim();
  if (content.startsWith('"') && content.endsWith('"')) {
    // In the new 'jsonString' context, Server side code comes as a string with escaped characters,
    // hence the double parse
    return JSON.parse(JSON.parse(content));
  }
  return JSON.parse(cleanUp(content));
}

function extractFormDefinition(block) {
  let formDef;
  const container = block.querySelector('pre');
  const codeEl = container?.querySelector('code');
  const content = codeEl?.textContent;
  if (content) {
    formDef = decode(content);
  }
  return { container, formDef };
}

export async function fetchForm(pathname) {
  // get the main form
  let data;
  let path = pathname;
  if (path.startsWith(window.location.origin) && !path.includes('.json')) {
    if (path.endsWith('.html')) {
      path = path.substring(0, path.lastIndexOf('.html'));
    }
    path += '/jcr:content/root/section/form.html';
  }
  let resp = await fetch(path);

  if (resp?.headers?.get('Content-Type')?.includes('application/json')) {
    data = await resp.json();
  } else if (resp?.headers?.get('Content-Type')?.includes('text/html')) {
    resp = await fetch(path);
    data = await resp.text().then((html) => {
      try {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        if (doc) {
          return extractFormDefinition(doc.body).formDef;
        }
        return doc;
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('Unable to fetch form definition for path', pathname, path);
        return null;
      }
    });
  }
  return data;
}

function addRequestContextToForm(formDef) {
  if (formDef && typeof formDef === 'object') {
    formDef.properties = formDef.properties || {};

    // Add URL parameters
    try {
      const urlParams = new URLSearchParams(window?.location?.search || '');
      if (!formDef.properties.queryParams) {
        formDef.properties.queryParams = {};
      }
      urlParams?.forEach((value, key) => {
        formDef.properties.queryParams[key?.toLowerCase()] = value;
      });
    } catch (e) {
      console.warn('Error reading URL parameters:', e);
    }

    // Add cookies
    try {
      const cookies = document?.cookie.split(';');
      formDef.properties.cookies = {};
      cookies?.forEach((cookie) => {
        if (cookie.trim()) {
          const [key, value] = cookie.trim().split('=');
          formDef.properties.cookies[key.trim()] = value || '';
        }
      });
    } catch (e) {
      console.warn('Error reading cookies:', e);
    }
  }
}



function decorateLoanSliders(form) {
  const sliderConfigs = {
    'field-loan-amount-inr': {
      min: 50000, max: 1500000, step: 10000, defaultVal: 1500000,
      labels: ['50K', '2L', '4L', '6L', '8L', '10L', '15L'],
      format: (v) => `₹${Number(v).toLocaleString('en-IN')}`,
    },
    'field-loan-tenure-months': {
      min: 12, max: 84, step: 12, defaultVal: 84,
      labels: ['12m', '24m', '36m', '48m', '60m', '72m', '84m'],
      format: (v) => `${v} months`,
    },
  };

  const state = { amount: 1500000, tenure: 84 };

  const RATE_TIERS = [
    { upTo: 200000, rate: 14.50 },
    { upTo: 400000, rate: 13.50 },
    { upTo: 600000, rate: 12.75 },
    { upTo: 900000, rate: 12.00 },
    { upTo: 1200000, rate: 11.25 },
    { upTo: 1500000, rate: 10.97 },
  ];

  function getRateForAmount(amount) {
    const tier = RATE_TIERS.find((t) => amount <= t.upTo);
    return tier ? tier.rate : RATE_TIERS[RATE_TIERS.length - 1].rate;
  }

  const PROCESSING_FEE_RATE = 0.015;
  const GST_RATE = 0.18;

  function ensureLabel(fieldEl, labelText) {
    if (!fieldEl) return;
    if (!fieldEl.querySelector('.field-label')) {
      const label = document.createElement('label');
      label.className = 'field-label';
      label.textContent = labelText;
      fieldEl.prepend(label);
    }
  }

  function updateEMI() {
    const P = state.amount;
    const n = state.tenure;
    const annualRate = getRateForAmount(P);
    const r = annualRate / (12 * 100);
    const onePlusRPowN = (1 + r) ** n;
    const emi = Math.round((P * r * onePlusRPowN) / (onePlusRPowN - 1));
    const processingFee = Math.min(Math.round(P * PROCESSING_FEE_RATE), 6500);
    const taxes = Math.round(processingFee * GST_RATE);

    const emiField = form.querySelector('.field-emi-amount');
    ensureLabel(emiField, 'EMI Amount');
    const emiEl = emiField?.querySelector('p');
    if (emiEl) emiEl.textContent = `₹${emi.toLocaleString('en-IN')}`;

    const rateField = form.querySelector('.field-rate-of-interest');
    ensureLabel(rateField, 'Rate of Interest');
    const rateEl = rateField?.querySelector('p');
    if (rateEl) rateEl.textContent = `${annualRate.toFixed(2)}%`;

    const taxesField = form.querySelector('.field-taxes-amount');
    ensureLabel(taxesField, 'Taxes');
    const taxesEl = taxesField?.querySelector('p');
    if (taxesEl) taxesEl.textContent = `₹${taxes.toLocaleString('en-IN')}`;

    // Processing Fee row — injected once, updated on every slider change
    let processingFeeRow = form.querySelector('.field-processing-fee-display');
    if (!processingFeeRow && taxesField) {
      processingFeeRow = document.createElement('div');
      processingFeeRow.className = 'field-processing-fee-display';
      processingFeeRow.innerHTML = '<label>Processing Fee</label><p></p>';
      taxesField.insertAdjacentElement('afterend', processingFeeRow);
    }
    const processingFeeEl = processingFeeRow?.querySelector('p');
    if (processingFeeEl) processingFeeEl.textContent = `₹${processingFee.toLocaleString('en-IN')}`;

    const approvedEl = form.querySelector('.field-approved-loan-amount p');
    if (approvedEl) approvedEl.textContent = `₹${P.toLocaleString('en-IN')}`;

    // Sync values into summary panels by matching label text
    const summaryPanels = [
      form.querySelector('.field-loan-details'),
      form.querySelector('.field-xpress-personal-loan-summary-panel'),
    ];
    summaryPanels.forEach((panel) => {
      if (!panel) return;
      panel.querySelectorAll('.text-wrapper, .date-wrapper').forEach((wrapper) => {
        const labelText = (wrapper.querySelector('label')?.textContent || '').toLowerCase();
        const input = wrapper.querySelector('input');
        if (!input) return;
        if (labelText.includes('loan amount')) {
          input.value = `₹${P.toLocaleString('en-IN')}`;
        } else if (labelText.includes('emi')) {
          input.value = `₹${emi.toLocaleString('en-IN')}`;
        } else if (labelText.includes('tenure')) {
          input.value = `${n} months`;
        } else if (labelText.includes('rate') || labelText.includes('interest')) {
          input.value = `${annualRate.toFixed(2)}% p.a.`;
        } else if (labelText.includes('processing fee')) {
          input.value = `₹${processingFee.toLocaleString('en-IN')}`;
        } else if (labelText.includes('tax') || labelText.includes('gst')) {
          input.value = `₹${taxes.toLocaleString('en-IN')}`;
        }
      });
    });

    // Populate Schedule of Charges in Loan Details panel only
    // Formula: Processing Fee + 18% GST = processingFee + taxes
    const loanDetailsPanel = form.querySelector('.field-loan-details');
    if (loanDetailsPanel) {
      const totalCharges = processingFee + taxes;
      const socWrapper = loanDetailsPanel.querySelector('.field-schedule-of-charges');
      if (socWrapper) {
        let valueEl = socWrapper.querySelector('.soc-value');
        if (!valueEl) {
          valueEl = document.createElement('span');
          valueEl.className = 'soc-value';
          socWrapper.appendChild(valueEl);
        }
        valueEl.textContent = `₹${totalCharges.toLocaleString('en-IN')}`;
      }
    }
  }

  function buildSlider(fieldWrapper, config) {
    if (fieldWrapper.querySelector('.loan-range-slider')) return;
    const numInput = fieldWrapper.querySelector('input[type="number"]');
    if (!numInput) return;

    const display = document.createElement('input');
    display.type = 'text';
    display.readOnly = true;
    display.className = 'loan-amount-display';
    numInput.replaceWith(display);

    const sliderWrap = document.createElement('div');
    sliderWrap.className = 'loan-range-slider';

    const range = document.createElement('input');
    range.type = 'range';
    range.min = config.min;
    range.max = config.max;
    range.step = config.step;
    range.value = config.defaultVal;

    const labelsDiv = document.createElement('div');
    labelsDiv.className = 'loan-range-labels';
    config.labels.forEach((label) => {
      const span = document.createElement('span');
      span.textContent = label;
      labelsDiv.append(span);
    });

    range._loanConfig = config;
    range._labelsDiv = labelsDiv;
    sliderWrap.append(range, labelsDiv);
    fieldWrapper.insertAdjacentElement('afterend', sliderWrap);

    function syncApprovedAmount(value) {
      const approvedEl = form.querySelector('.field-approved-loan-amount p');
      if (approvedEl && fieldWrapper.classList.contains('field-loan-amount-inr')) {
        approvedEl.textContent = `₹${Number(value).toLocaleString('en-IN')}`;
      }
    }

    function updateFill() {
      const pct = ((range.value - config.min) / (config.max - config.min)) * 100;
      range.style.setProperty('--range-pct', `${pct}%`);
      display.value = config.format(range.value);
      numInput.value = range.value;
      syncApprovedAmount(range.value);
      if (fieldWrapper.classList.contains('field-loan-amount-inr')) {
        state.amount = Number(range.value);
      } else {
        state.tenure = Number(range.value);
      }
      updateEMI();
    }

    range.addEventListener('input', () => {
      updateFill();
      numInput.dispatchEvent(new Event('change', { bubbles: true }));
    });

    updateFill();
  }

  function apply() {
    Object.entries(sliderConfigs).forEach(([cls, config]) => {
      const wrapper = form.querySelector(`.${cls}`);
      if (wrapper) buildSlider(wrapper, config);
    });
  }

  apply();
  const observer = new MutationObserver(() => apply());
  observer.observe(form, { childList: true, subtree: true });
}

const EYE_OPEN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
const EYE_SLASH_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;

function decorateLoanEligibilityButton(form) {
  function getAge(dobValue) {
    if (!dobValue) return 0;
    const dob = new Date(dobValue);
    if (Number.isNaN(dob.getTime())) return 0;
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const monthDiff = today.getMonth() - dob.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) age -= 1;
    return age;
  }

  function isValid() {
    const phone = form.querySelector('.field-mobile-number input');
    const dob = form.querySelector('.field-date-of-birth input');
    const checkboxes = [
      ...form.querySelectorAll('.field-consent-communication input[type="checkbox"]'),
      ...form.querySelectorAll('.field-consent-marketing input[type="checkbox"]'),
    ];
    const phoneOk = (phone?.value || '').replace(/\D/g, '').length >= 10;
    const dobRaw = (dob?.getAttribute('edit-value') || dob?.value || '').trim();
    const age = getAge(dobRaw);
    const dobOk = dobRaw.length > 0 && age >= 21 && age <= 60;
    const checkboxesOk = checkboxes.length > 0 && checkboxes.every((cb) => cb.checked);
    return phoneOk && dobOk && checkboxesOk;
  }

  function updateButton() {
    const btn = form.querySelector('.field-view-loan-eligibility button');
    if (!btn) return;
    btn.disabled = !isValid();
  }

  function updateDobError() {
    const dob = form.querySelector('.field-date-of-birth input');
    const dobField = form.querySelector('.field-date-of-birth');
    if (!dobField || !dob) return;

    let errorEl = dobField.querySelector('.dob-age-error');
    const dobRaw = (dob.getAttribute('edit-value') || dob.value || '').trim();
    const age = dobRaw.length > 0 ? getAge(dobRaw) : null;

    const ageInvalid = age !== null && (age < 21 || age > 60);
    if (ageInvalid) {
      if (!errorEl) {
        errorEl = document.createElement('span');
        errorEl.className = 'dob-age-error';
        dobField.append(errorEl);
      }
      errorEl.textContent = age < 21
        ? 'Age must be 21 or above to apply for a loan.'
        : 'Age must be 60 or below to apply for a loan.';
    } else if (errorEl) {
      errorEl.remove();
    }
  }

  function attachListeners() {
    const phone = form.querySelector('.field-mobile-number input');
    const dob = form.querySelector('.field-date-of-birth input');
    const checkboxes = [
      ...form.querySelectorAll('.field-consent-communication input[type="checkbox"]'),
      ...form.querySelectorAll('.field-consent-marketing input[type="checkbox"]'),
    ];

    if (phone && !phone.dataset.eligibilityWired) {
      phone.addEventListener('input', () => { updateDobError(); updateButton(); });
      phone.addEventListener('change', () => { updateDobError(); updateButton(); });
      phone.dataset.eligibilityWired = 'true';
    }

    if (dob && !dob.dataset.eligibilityWired) {
      const captureDob = () => {
        // While type="date" the browser exposes the real ISO value; persist it
        // so handleFocusOut (which resets input.value) doesn't lose it.
        if (dob.value) dob.setAttribute('edit-value', dob.value);
        updateDobError();
        updateButton();
      };
      dob.addEventListener('input', captureDob);
      dob.addEventListener('change', captureDob);
      dob.dataset.eligibilityWired = 'true';
    }

    checkboxes.forEach((cb) => {
      if (!cb.dataset.eligibilityWired) {
        cb.addEventListener('change', updateButton);
        cb.dataset.eligibilityWired = 'true';
      }
    });

    updateButton();
  }

  attachListeners();
  const observer = new MutationObserver(() => attachListeners());
  observer.observe(form, { childList: true, subtree: true });
}

function decorateSubmitOtpButton(form) {
  function showOtpError(input, msg) {
    const fieldOtp = input.closest('.field-otp');
    if (!fieldOtp) return;
    let errorEl = fieldOtp.querySelector('.otp-error-msg');
    if (!errorEl) {
      errorEl = document.createElement('span');
      errorEl.className = 'otp-error-msg';
      fieldOtp.append(errorEl);
    }
    errorEl.textContent = msg;
  }

  function clearOtpError(input) {
    input.closest('.field-otp')?.querySelector('.otp-error-msg')?.remove();
  }

  function attachListeners() {
    const btn = form.querySelector('.field-submit-otp button');
    const input = form.querySelector('.field-otp input');
    if (!btn || !input || input.dataset.submitWired) return;

    btn.disabled = true;

    input.addEventListener('input', () => {
      clearOtpError(input);
      btn.disabled = input.value.replace(/\s/g, '').length < 6;
    });

    btn.addEventListener('click', (e) => {
      const otpPanel = form.querySelector('.field-enter-otp-panel');

      // When attempts exhausted, skip OTP validation and go straight to next step
      if (otpPanel?.dataset.attemptsExhausted === 'true') {
        if (otpPanel) {
          for (let el = otpPanel.nextElementSibling; el; el = el.nextElementSibling) {
            if (el.tagName === 'FIELDSET') {
              navigateWizardToStep(form, el);
              break;
            }
          }
        }
        return;
      }

      const entered = input.value.replace(/\s/g, '');
      const expected = form.dataset.generatedOtp;

      if (expected && entered !== expected) {
        e.stopPropagation();
        e.preventDefault();
        showOtpError(input, 'OTP is invalid. Please try again.');
        btn.disabled = true;
        return;
      }

      // Valid — navigate to next wizard step
      if (otpPanel) {
        for (let el = otpPanel.nextElementSibling; el; el = el.nextElementSibling) {
          if (el.tagName === 'FIELDSET') {
            navigateWizardToStep(form, el);
            break;
          }
        }
      }
    });

    input.dataset.submitWired = 'true';
  }

  attachListeners();
  const observer = new MutationObserver(() => attachListeners());
  observer.observe(form, { childList: true, subtree: true });
}


function decorateIncomeVerification(form) {
  function decorate() {
    const radioGroup = form.querySelector('.field-income-verification-method');
    if (!radioGroup || radioGroup.dataset.incomeDecorated) return;
    radioGroup.dataset.incomeDecorated = 'true';

    const descs = (radioGroup.dataset.description || '').split(' | ');
    const wrappers = radioGroup.querySelectorAll('.radio-wrapper');

    wrappers.forEach((wrapper, i) => {
      const radio = wrapper.querySelector('input[type="radio"]');
      const label = wrapper.querySelector('label');
      if (!radio || !label) return;

      const headerRow = document.createElement('div');
      headerRow.className = 'iv-card-header';
      headerRow.append(radio, label);
      wrapper.appendChild(headerRow);

      if (descs[i]) {
        const desc = document.createElement('p');
        desc.className = 'iv-card-desc';
        desc.textContent = descs[i].trim();
        wrapper.appendChild(desc);
      }

      if (i === 0) {
        const badge = document.createElement('span');
        badge.className = 'iv-recommended';
        badge.textContent = 'Recommended';
        wrapper.appendChild(badge);
      }

      if (radio.checked) wrapper.classList.add('iv-checked');
      radio.addEventListener('change', () => {
        wrappers.forEach((w) => w.classList.remove('iv-checked'));
        wrapper.classList.add('iv-checked');
      });
    });

    const descDiv = radioGroup.querySelector('.field-description');
    if (descDiv) descDiv.style.display = 'none';
  }

  decorate();
  const observer = new MutationObserver(() => decorate());
  observer.observe(form, { childList: true, subtree: true });
}

const BANK_CARDS = [
  {
    value: 'hdfc_bank', name: 'HDFC',
    svg: `<svg viewBox="0 0 44 44" xmlns="http://www.w3.org/2000/svg"><rect width="44" height="44" rx="6" fill="#fff"/><rect x="9" y="9" width="26" height="26" rx="2" fill="none" stroke="#dc2626" stroke-width="2.5"/><rect x="14" y="14" width="4" height="16" fill="#dc2626"/><rect x="26" y="14" width="4" height="16" fill="#dc2626"/><rect x="14" y="20" width="16" height="4" fill="#dc2626"/></svg>`,
  },
  {
    value: 'icici_bank', name: 'ICICI Bank',
    svg: `<svg viewBox="0 0 44 44" xmlns="http://www.w3.org/2000/svg"><rect width="44" height="44" rx="6" fill="#fff"/><circle cx="22" cy="22" r="13" fill="#f26522"/><circle cx="22" cy="15" r="2.5" fill="white"/><rect x="19.5" y="19" width="5" height="10" rx="1.5" fill="white"/></svg>`,
  },
  {
    value: 'axis_bank', name: 'Axis',
    svg: `<svg viewBox="0 0 44 44" xmlns="http://www.w3.org/2000/svg"><rect width="44" height="44" rx="6" fill="#fff"/><polygon points="22,8 35,36 9,36" fill="none" stroke="#97144d" stroke-width="3" stroke-linejoin="round"/><line x1="14" y1="28" x2="30" y2="28" stroke="#97144d" stroke-width="3" stroke-linecap="round"/></svg>`,
  },
  {
    value: 'kotak', name: 'Kotak',
    svg: `<svg viewBox="0 0 44 44" xmlns="http://www.w3.org/2000/svg"><rect width="44" height="44" rx="6" fill="#fff"/><circle cx="22" cy="22" r="13" fill="#231f20"/><ellipse cx="18" cy="22" rx="5" ry="5" fill="none" stroke="#ed1c24" stroke-width="2.5"/><ellipse cx="26" cy="22" rx="5" ry="5" fill="none" stroke="#ed1c24" stroke-width="2.5"/></svg>`,
  },
  {
    value: 'sbi', name: 'SBI',
    svg: `<svg viewBox="0 0 44 44" xmlns="http://www.w3.org/2000/svg"><rect width="44" height="44" rx="6" fill="#fff"/><circle cx="22" cy="22" r="13" fill="#1e4799"/><circle cx="22" cy="18" r="4.5" fill="white"/><path d="M18.5 22 L20 31 L24 31 L25.5 22 Z" fill="white"/></svg>`,
  },
  {
    value: 'bank_of_baroda', name: 'Bank of Baroda',
    svg: `<svg viewBox="0 0 44 44" xmlns="http://www.w3.org/2000/svg"><rect width="44" height="44" rx="6" fill="#fff"/><rect x="13" y="11" width="5" height="22" rx="1" fill="#e55000"/><path d="M18 11 L25 11 C29 11 31 14 31 17.5 C31 21 29 22.5 27 23 C29.5 23.5 32 26 32 29 C32 32.5 29.5 33 25 33 L18 33 Z" fill="#e55000"/></svg>`,
  },
  {
    value: 'idfc_first', name: 'IDFC First Bank',
    svg: `<svg viewBox="0 0 44 44" xmlns="http://www.w3.org/2000/svg"><rect width="44" height="44" rx="6" fill="#fff"/><rect x="10" y="10" width="24" height="24" rx="3" fill="#971b2f"/><rect x="16" y="15" width="4" height="14" rx="1" fill="white"/><rect x="16" y="15" width="12" height="4" rx="1" fill="white"/><rect x="16" y="21" width="9" height="3" rx="1" fill="white"/></svg>`,
  },
];

function decorateBankSelector(form) {
  function build() {
    const panel = form.querySelector('.field-loan-type-selection');
    if (!panel || panel.dataset.bankJsDecorated) return;
    const selectWrapper = panel.querySelector('.field-select-loan-type');
    const select = selectWrapper?.querySelector('select');
    if (!select) return;
    panel.dataset.bankJsDecorated = 'true';
    // Remove any previously injected container so we always rebuild fresh
    panel.querySelector('.bank-picker-container')?.remove();

    const container = document.createElement('div');
    container.className = 'bank-picker-container';

    const cardsRow = document.createElement('div');
    cardsRow.className = 'bank-cards-row';

    BANK_CARDS.forEach((bank) => {
      const { value, name } = bank;
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'bank-card';
      card.dataset.value = value;

      const iconWrap = document.createElement('span');
      iconWrap.className = 'bank-icon-wrap';
      iconWrap.innerHTML = bank.svg;
      const svgEl = iconWrap.querySelector('svg');
      if (svgEl) { svgEl.setAttribute('width', '44'); svgEl.setAttribute('height', '44'); }

      const nameEl = document.createElement('span');
      nameEl.className = 'bank-card-name';
      nameEl.textContent = name;

      card.append(iconWrap, nameEl);
      if (select.value === value) card.classList.add('selected');

      card.addEventListener('click', () => {
        container.querySelectorAll('.bank-card').forEach((c) => c.classList.remove('selected'));
        card.classList.add('selected');
        select.value = value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        otherSelect.value = '';
      });

      cardsRow.appendChild(card);
    });

    const otherWrap = document.createElement('div');
    otherWrap.className = 'bank-other-wrap';

    const otherSelect = document.createElement('select');
    otherSelect.className = 'bank-other-select';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Other Bank';
    otherSelect.appendChild(placeholder);

    otherSelect.addEventListener('change', () => {
      if (otherSelect.value) {
        container.querySelectorAll('.bank-card').forEach((c) => c.classList.remove('selected'));
        select.value = 'other_bank';
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    otherWrap.appendChild(otherSelect);
    container.append(cardsRow, otherWrap);

    selectWrapper.style.display = 'none';
    panel.appendChild(container);
  }

  build();
  const observer = new MutationObserver(() => build());
  observer.observe(form, { childList: true, subtree: true });
}

const ALLOWED_EMAIL_DOMAINS = ['@gmail.com', '@outlook.com', '@yahoo.com'];

function isValidEmailDomain(value) {
  const v = (value || '').trim().toLowerCase();
  return ALLOWED_EMAIL_DOMAINS.some((domain) => v.endsWith(domain));
}

function isValidEmail(value) {
  const v = (value || '').trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function decorateEmailVerifyJoined(form) {
  const pairs = [
    {
      panel: '.field-personal-details-panel',
      email: '.field-email-id',
      verify: '.field-verify-email-button',
      isValid: isValidEmailDomain,
    },
    {
      panel: '.field-work-email-id-panel',
      email: '.field-work-email-id',
      verify: '.field-verify-work-email-button',
      isValid: isValidEmail,
    },
  ];
  function mergeAll() {
    pairs.forEach(({ panel, email, verify, isValid }) => {
      const panelEl = form.querySelector(panel);
      if (!panelEl) return;
      const emailWrapper = panelEl.querySelector(email);
      const verifyWrapper = panelEl.querySelector(verify);
      if (!emailWrapper || !verifyWrapper || emailWrapper.dataset.verifyMerged) return;
      const btn = verifyWrapper.querySelector('button');
      if (!btn) return;
      emailWrapper.dataset.verifyMerged = 'true';
      emailWrapper.appendChild(btn);

      const input = emailWrapper.querySelector('input');
      btn.disabled = true;

      const checkValidity = () => { btn.disabled = !isValid(input.value); };
      input.addEventListener('input', checkValidity);

      btn.addEventListener('click', () => {
        if (!isValid(input.value)) return;
        btn.textContent = 'Verified';
        btn.disabled = true;
        btn.classList.add('email-verified');
        input.removeEventListener('input', checkValidity);
      });
    });
  }
  mergeAll();
  const observer = new MutationObserver(() => mergeAll());
  observer.observe(form, { childList: true, subtree: true });
}

// PAN: 3 alpha + 'P' (4th) + 1 alpha + 4 digits + 1 alpha, total 10 chars
const PAN_REGEX = /^[A-Z]{3}P[A-Z][0-9]{4}[A-Z]$/;

function validatePan(raw) {
  const v = (raw || '').trim().toUpperCase();
  if (v.length !== 10) return 'PAN must be exactly 10 characters.';
  // Pass immediately if the full regex matches — no further checks needed
  if (PAN_REGEX.test(v)) return null;
  // Regex failed — give a specific message for the first broken rule
  if (!/^[A-Z]{5}/.test(v)) return 'First 5 characters of PAN must be alphabets.';
  if (v[3] !== 'P') return 'Fourth character of PAN must be "P".';
  if (!/^[0-9]{4}$/.test(v.slice(5, 9))) return 'Characters 6–9 of PAN must be numeric.';
  return 'PAN could not be verified. Please enter a valid PAN.';
}

function decoratePanVerify(form) {
  const REVIEW_PANELS = ['.field-personal-details', '.field-loan-details', '.field-xpress-personal-loan-summary-panel'];
  function apply() {
    form.querySelectorAll('.text-wrapper').forEach((wrapper) => {
      if (wrapper.dataset.panVerifyAdded || wrapper.querySelector('.pan-verify-btn')) return;
      // Skip PAN fields inside review/summary panels — they are display-only
      if (REVIEW_PANELS.some((s) => wrapper.closest(s))) return;
      const label = wrapper.querySelector('label');
      if (!label) return;
      const labelText = label.textContent.trim().toLowerCase();
      if (labelText !== 'pan number' && !labelText.startsWith('pan ') && labelText !== 'pan') return;
      wrapper.dataset.panVerifyAdded = 'true';

      const input = wrapper.querySelector('input');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = 'Verify';
      btn.className = 'pan-verify-btn';
      btn.disabled = true;

      const checkValidity = () => {
        if (input) {
          const pos = input.selectionStart;
          input.value = input.value.toUpperCase();
          input.setSelectionRange(pos, pos);
        }
        btn.disabled = !!validatePan(input?.value);
      };

      if (input) input.addEventListener('input', checkValidity);

      btn.addEventListener('click', () => {
        if (validatePan(input?.value)) return;
        btn.textContent = 'Verified';
        btn.disabled = true;
        btn.classList.add('pan-verified');
        if (input) input.removeEventListener('input', checkValidity);
      });

      wrapper.appendChild(btn);
    });
  }
  apply();
  const observer = new MutationObserver(() => apply());
  observer.observe(form, { childList: true, subtree: true });
}

function decorateMoveSubmitButton(form) {
  function moveButton() {
    const personalDetails = form.querySelector('.field-personal-details');
    if (!personalDetails) return;
    [...personalDetails.children].forEach((child) => {
      if (child.classList.contains('button-wrapper') && !child.dataset.movedOut) {
        child.dataset.movedOut = 'true';
        personalDetails.insertAdjacentElement('afterend', child);
      }
    });
  }
  moveButton();
  const observer = new MutationObserver(() => moveButton());
  observer.observe(form, { childList: true, subtree: true });
}

function startOtpTimer(panel) {
  if (panel._otpTimerInterval) clearInterval(panel._otpTimerInterval);

  const timerInput = panel.querySelector('input[name="Resend OTP in:"]');
  const timerTextEl = panel.querySelector('.field-resend-otp-timer p');
  const timerWrapper = panel.querySelector('.field-resend-otp-in') || panel.querySelector('.field-resend-otp-timer');
  const resendWrapper = panel.querySelector('.field-resend-otp') || panel.querySelector('.field-resend');

  let timeLeft = 45;

  if (timerWrapper) timerWrapper.style.display = 'flex';
  if (resendWrapper) resendWrapper.style.display = 'none';
  if (timerInput) timerInput.value = `${timeLeft}s`;
  if (timerTextEl && !timerInput) timerTextEl.textContent = `Resend OTP in: ${timeLeft}s`;

  panel._otpTimerInterval = setInterval(() => {
    timeLeft -= 1;
    if (timerInput) timerInput.value = `${timeLeft}s`;
    if (timerTextEl && !timerInput) timerTextEl.textContent = `Resend OTP in: ${timeLeft}s`;

    if (timeLeft <= 0) {
      clearInterval(panel._otpTimerInterval);
      panel._otpTimerInterval = null;
      if (timerWrapper) timerWrapper.style.display = 'none';
      if (resendWrapper) resendWrapper.style.display = '';
      if (panel._updateAttemptsDisplay) panel._updateAttemptsDisplay();
    }
  }, 1000);
}

function stopOtpTimer(panel) {
  if (panel._otpTimerInterval) {
    clearInterval(panel._otpTimerInterval);
    panel._otpTimerInterval = null;
  }
  const timerInput = panel.querySelector('input[name="Resend OTP in:"]');
  const timerTextEl = panel.querySelector('.field-resend-otp-timer p');
  const timerWrapper = panel.querySelector('.field-resend-otp-in') || panel.querySelector('.field-resend-otp-timer');
  const resendWrapper = panel.querySelector('.field-resend-otp') || panel.querySelector('.field-resend');
  if (timerInput) timerInput.value = '';
  if (timerTextEl) timerTextEl.textContent = 'Resend OTP in:';
  if (timerWrapper) timerWrapper.style.display = 'none';
  if (resendWrapper) resendWrapper.style.display = '';
}

function wirePanelOtpTimer(panel, form) {
  if (panel.dataset.otpTimerWired) return;
  panel.dataset.otpTimerWired = 'true';

  const MAX_ATTEMPTS = 3;
  let attemptsLeft = MAX_ATTEMPTS;

  function updateAttemptsDisplay() {
    const attemptsEl = panel.querySelector('.field-otp-attempts-info p');
    if (!attemptsEl) return;
    attemptsEl.style.display = '';
    if (attemptsLeft > 0) {
      attemptsEl.textContent = `${attemptsLeft}/${MAX_ATTEMPTS} attempts left`;
      attemptsEl.style.color = '';
      attemptsEl.style.fontWeight = '';
    } else {
      attemptsEl.textContent = 'Try again after 24 hours';
      attemptsEl.style.color = '#dc2626';
      attemptsEl.style.fontWeight = '600';
    }
  }
  panel._updateAttemptsDisplay = updateAttemptsDisplay;

  function onResendClick() {
    if (attemptsLeft <= 0) return;
    attemptsLeft -= 1;
    updateAttemptsDisplay();

    if (attemptsLeft > 0) {
      // Generate new OTP
      const newOtp = String(Math.floor(100000 + Math.random() * 900000));
      form.dataset.generatedOtp = newOtp;

      // Fill the OTP input with the new OTP
      const otpInput = panel.querySelector('.field-otp input') || form.querySelector('.field-otp input');
      if (otpInput) {
        otpInput.value = newOtp;
        otpInput.dispatchEvent(new Event('input', { bubbles: true }));
        otpInput.dispatchEvent(new Event('change', { bubbles: true }));
        // Clear any previous error
        otpInput.closest('.field-otp')?.querySelector('.otp-error-msg')?.remove();
      }

      // Re-enable submit button for the new OTP
      const submitBtn = panel.querySelector('.field-submit-otp button') || form.querySelector('.field-submit-otp button');
      if (submitBtn) submitBtn.removeAttribute('disabled');

      startOtpTimer(panel);

      // Try real API in background; update stored OTP if it responds
      const mobile = form.querySelector('.field-mobile-number input')?.value?.trim();
      const dobInput = form.querySelector('.field-date-of-birth input');
      const dob = (dobInput?.getAttribute('edit-value') || dobInput?.value || '').trim();
      fetch('http://localhost:3000/api/generate-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobile, dob }),
      }).then((res) => res.ok && res.json()).then((data) => {
        if (data?.otp) {
          form.dataset.generatedOtp = String(data.otp);
          if (otpInput) {
            otpInput.value = String(data.otp);
            otpInput.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }
      }).catch(() => { /* API unavailable — local OTP stays */ });
    } else {
      stopOtpTimer(panel);
      const resendWrapper = panel.querySelector('.field-resend-otp') || panel.querySelector('.field-resend');
      if (resendWrapper) resendWrapper.style.display = 'none';

      // Enable submit to let user proceed after attempts exhausted
      panel.dataset.attemptsExhausted = 'true';
      const submitBtn = panel.querySelector('.field-submit-otp button') || form.querySelector('.field-submit-otp button');
      if (submitBtn) submitBtn.removeAttribute('disabled');
    }
  }

  // Wire resend button
  const resendBtn = panel.querySelector('.field-resend-otp button, .field-resend button');
  if (resendBtn && !resendBtn.dataset.timerWired) {
    resendBtn.dataset.timerWired = 'true';
    resendBtn.addEventListener('click', onResendClick);
  }

  attemptsLeft = MAX_ATTEMPTS;
  updateAttemptsDisplay();
  startOtpTimer(panel);
}

function wireEligibilityOtpClick(form) {
  function wire() {
    const eligibilityBtn = form.querySelector('.field-view-loan-eligibility button');
    if (!eligibilityBtn || eligibilityBtn.dataset.timerWired) return;
    eligibilityBtn.dataset.timerWired = 'true';

    eligibilityBtn.addEventListener('click', async () => {
      const mobile = form.querySelector('.field-mobile-number input')?.value?.trim();
      const dobInput = form.querySelector('.field-date-of-birth input');
      const dob = (dobInput?.getAttribute('edit-value') || dobInput?.value || '').trim();

      let otpString = String(Math.floor(100000 + Math.random() * 900000));
      form.dataset.generatedOtp = otpString;
      const otpPanel = form.querySelector('.field-enter-otp-panel');

      const fillOtp = () => {
        const otpInput = form.querySelector('.field-otp input');
        if (!otpInput) return;
        otpInput.value = otpString;
        otpInput.dispatchEvent(new Event('input', { bubbles: true }));
        otpInput.dispatchEvent(new Event('change', { bubbles: true }));
        const submitBtn = form.querySelector('.field-submit-otp button');
        if (submitBtn) submitBtn.removeAttribute('disabled');
      };

      fillOtp();

      if (otpPanel) {
        let navObserver = new MutationObserver(() => {
          fillOtp();
          setTimeout(fillOtp, 150);
          setTimeout(fillOtp, 450);
          navObserver.disconnect();
          navObserver = null;
        });
        navObserver.observe(otpPanel, { attributes: true, attributeFilter: ['class', 'style'] });
        setTimeout(() => { if (navObserver) { navObserver.disconnect(); navObserver = null; } }, 10000);

        // Restart the OTP timer exactly when the panel becomes the active wizard step
        let timerTrigger = new MutationObserver(() => {
          if (otpPanel.classList.contains('current-wizard-step')) {
            timerTrigger.disconnect();
            timerTrigger = null;
            delete otpPanel.dataset.otpTimerWired;
            wirePanelOtpTimer(otpPanel, form);
          }
        });
        timerTrigger.observe(otpPanel, { attributes: true, attributeFilter: ['class'] });
        setTimeout(() => { if (timerTrigger) { timerTrigger.disconnect(); timerTrigger = null; } }, 10000);
      }

      try {
        const res = await fetch('http://localhost:3000/api/generate-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mobile, dob }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.otp) {
            otpString = String(data.otp);
            form.dataset.generatedOtp = otpString;
            fillOtp();
          }
        }
      } catch { /* API unavailable — local OTP stays */ }
    });
  }

  wire();
  const observer = new MutationObserver(() => wire());
  observer.observe(form, { childList: true, subtree: true });
}

function decorateOtpTimer(form) {
  function wire() {
    form.querySelectorAll('.field-enter-otp-panel').forEach((panel) => {
      const isVisible = panel.dataset.visible !== 'false'
        && getComputedStyle(panel).display !== 'none';
      if (isVisible && !panel.dataset.otpTimerWired) {
        wirePanelOtpTimer(panel, form);
      } else if (!isVisible && panel.dataset.otpTimerWired) {
        delete panel.dataset.otpTimerWired;
      }
    });
  }

  wire();
  const observer = new MutationObserver(() => wire());
  observer.observe(form, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-visible', 'style', 'class'] });
}

function navigateWizardToStep(form, targetFieldset) {
  const wizardPanel = targetFieldset.closest('.wizard');
  if (!wizardPanel) return;
  const current = wizardPanel.querySelector('.current-wizard-step');
  if (!current || current === targetFieldset) return;

  current.classList.remove('current-wizard-step');
  targetFieldset.classList.add('current-wizard-step');

  const currentMenuItem = wizardPanel.querySelector('.wizard-menu-active-item');
  const targetMenuItem = wizardPanel.querySelector(`li[data-index="${targetFieldset.dataset.index}"]`);
  if (currentMenuItem) currentMenuItem.classList.remove('wizard-menu-active-item');
  if (targetMenuItem) targetMenuItem.classList.add('wizard-menu-active-item');

  wizardPanel.dispatchEvent(new CustomEvent('wizard:navigate', {
    detail: {
      prevStep: { id: current.id, index: +current.dataset.index },
      currStep: { id: targetFieldset.id, index: +targetFieldset.dataset.index },
    },
    bubbles: false,
  }));
}

function decorateEditMobileNumber(form) {
  function getMobileStep() {
    const otpPanel = form.querySelector('.field-enter-otp-panel');
    if (!otpPanel) return null;
    const wizard = otpPanel.closest('.wizard');
    if (!wizard) return null;
    return wizard.querySelector(':scope > fieldset:not([data-visible="false"])')
      || wizard.querySelector(':scope > fieldset');
  }

  function wire() {
    const instructions = form.querySelector('.field-otp-instructions');
    if (!instructions || instructions.dataset.editMobileWired) return;

    const uEl = [...instructions.querySelectorAll('u')].find(
      (u) => u.textContent.trim().toLowerCase().includes('edit mobile'),
    );
    if (!uEl) return;

    instructions.dataset.editMobileWired = 'true';
    uEl.style.cursor = 'pointer';
    uEl.style.color = '#3d52d5';
    uEl.addEventListener('click', () => {
      const mobileStep = getMobileStep();
      if (mobileStep) navigateWizardToStep(form, mobileStep);
    });
  }

  wire();
  const observer = new MutationObserver(() => wire());
  observer.observe(form, { childList: true, subtree: true });
}

function decorateCollapsiblePanels(form) {
  const selectors = ['.field-loan-details > legend', '.field-personal-details > legend', '.field-employer-details-panel > legend', '.field-income-details-panel > legend', '.field-work-email-id-panel > legend', '.field-type-of-loan-panel > legend', '.field-salary-account-details > legend', '.field-office-address-panel > legend', '.field-reference-details > legend', '.field-verify-email-id > legend'];
  selectors.forEach((sel) => {
    const legend = form.querySelector(sel);
    if (!legend || legend.dataset.collapsible) return;
    legend.dataset.collapsible = 'true';
    legend.style.cursor = 'pointer';
    legend.addEventListener('click', () => {
      legend.closest('fieldset').classList.toggle('collapsed');
    });
  });
}

function decorateOtpInput(form) {
  function applyToInput() {
    const fieldOtp = form.querySelector('.field-otp');
    const input = fieldOtp?.querySelector('input');
    if (!input || input.dataset.otpDecorated) return;
    input.type = 'text';
    input.maxLength = 6;
    input.placeholder = '· · · · · ·';
    input.dataset.otpDecorated = 'true';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'otp-eye-toggle';
    btn.setAttribute('aria-label', 'Hide OTP');
    btn.innerHTML = EYE_SLASH_SVG;

    btn.addEventListener('click', () => {
      const isHidden = input.type === 'password';
      if (isHidden) {
        input.type = 'text';
        btn.innerHTML = EYE_SLASH_SVG;
        btn.setAttribute('aria-label', 'Hide OTP');
      } else {
        input.type = 'password';
        btn.innerHTML = EYE_OPEN_SVG;
        btn.setAttribute('aria-label', 'Show OTP');
      }
    });

    fieldOtp.append(btn);
  }
  applyToInput();
  const observer = new MutationObserver(() => applyToInput());
  observer.observe(form, { childList: true, subtree: true });
}

const CUSTOMER_DATA = [
  {
    fullName: 'Ankit Shah',
    currentAddress: 'Mumbai, Maharashtra',
    residenceType: 'Owned',
  },
  {
    fullName: 'Rahul Mehta',
    currentAddress: 'Pune, Maharashtra',
    residenceType: 'Rented',
  },
  {
    fullName: 'Priya Sharma',
    currentAddress: 'Delhi, India',
    residenceType: 'Owned',
  },
  {
    fullName: 'Sneha Reddy',
    currentAddress: 'Hyderabad, Telangana',
    residenceType: 'Rented',
  },
  {
    fullName: 'Arjun Kumar',
    currentAddress: 'Bangalore, Karnataka',
    residenceType: 'Owned',
  },
];

function decorateRandomCustomerData(form) {
  const customer = CUSTOMER_DATA[Math.floor(Math.random() * CUSTOMER_DATA.length)];

  const LABEL_MAP = [
    { match: 'full name', value: customer.fullName },
    { match: 'current address', value: customer.currentAddress },
    { match: 'residence type', value: customer.residenceType },
  ];

  function fillField(wrapper) {
    const label = wrapper.querySelector('label');
    const input = wrapper.querySelector('input[type="text"], input[type="email"], textarea, select');
    if (!label || !input) return;

    // Never overwrite a field that already has a value
    if (input.value && input.value.trim()) return;

    const labelText = label.textContent.trim().toLowerCase();
    const match = LABEL_MAP.find((m) => labelText.includes(m.match));
    if (!match) return;

    wrapper.dataset.customerFilled = 'true';

    if (input.tagName === 'SELECT') {
      const option = [...input.options].find(
        (o) => o.value.toLowerCase() === match.value.toLowerCase()
          || o.text.toLowerCase() === match.value.toLowerCase(),
      );
      if (option) input.value = option.value;
    } else {
      input.value = match.value;
    }
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function fillAddressDisplay() {
    const addressDisplay = form.querySelector('.field-aadhaar-address-display');
    if (!addressDisplay || addressDisplay.dataset.customerFilled) return;
    const b = addressDisplay.querySelector('b');
    if (!b) return;
    addressDisplay.dataset.customerFilled = 'true';
    b.textContent = customer.currentAddress;
  }

  function apply() {
    form.querySelectorAll('.text-wrapper, .drop-down-wrapper, .multiline-wrapper').forEach(fillField);
    fillAddressDisplay();
  }

  apply();
  const observer = new MutationObserver(() => apply());
  observer.observe(form, { childList: true, subtree: true });
}

function decorateLoanAmountFromIncome(form) {
  const MIN_LOAN = 50000;
  const MAX_LOAN = 1500000;
  const STEP = 10000;

  // Standard formula: Max loan = Monthly Net Income × 10, capped at ₹15L, floor ₹50K
  function calcMaxLoan(monthlyIncome) {
    const raw = Math.min(monthlyIncome * 10, MAX_LOAN);
    const rounded = Math.round(raw / STEP) * STEP;
    return Math.max(rounded, MIN_LOAN);
  }

  function formatLabel(val) {
    if (val >= 100000) {
      const l = val / 100000;
      return `${Number.isInteger(l) ? l : l.toFixed(1)}L`;
    }
    return `${Math.round(val / 1000)}K`;
  }

  function regenerateLabels(labelsDiv, min, max) {
    labelsDiv.innerHTML = '';
    const count = 6;
    for (let i = 0; i <= count; i++) {
      const val = Math.round((min + ((max - min) / count) * i) / STEP) * STEP;
      const span = document.createElement('span');
      span.textContent = formatLabel(val);
      labelsDiv.append(span);
    }
  }

  function getLoanRange() {
    return form.querySelector('.loan-range-slider input[type="range"]');
  }

  function applyMax(newMax) {
    const range = getLoanRange();
    if (!range || !range._loanConfig) return;
    range._loanConfig.max = newMax;
    range.max = newMax;
    if (Number(range.value) > newMax) range.value = newMax;
    if (range._labelsDiv) regenerateLabels(range._labelsDiv, MIN_LOAN, newMax);
    range.dispatchEvent(new Event('input', { bubbles: false }));
  }

  function wire() {
    const panel = form.querySelector('.field-income-details-panel');
    if (!panel) return;
    panel.querySelectorAll('.number-wrapper, .text-wrapper').forEach((wrapper) => {
      if (wrapper.dataset.incomeValidationWired) return;
      const label = wrapper.querySelector('label');
      const input = wrapper.querySelector('input[type="number"]');
      if (!label || !input) return;
      const text = label.textContent.trim().toLowerCase();
      if (!text.includes('income') && !text.includes('salary') && !text.includes('monthly')) return;
      wrapper.dataset.incomeValidationWired = 'true';

      const update = () => {
        const val = Number(input.value);
        if (val > 0) applyMax(calcMaxLoan(val));
        else applyMax(MAX_LOAN);
      };
      input.addEventListener('input', update);
      input.addEventListener('change', update);
    });
  }

  wire();
  const observer = new MutationObserver(() => wire());
  observer.observe(form, { childList: true, subtree: true });
}

function decorateLoanApplicationNumber(form) {
  function apply() {
    const wrapper = form.querySelector('.field-loan-application-number');
    const input = wrapper?.querySelector('input[type="text"]');
    if (!input || input.dataset.appNoGenerated) return;
    input.dataset.appNoGenerated = 'true';
    input.value = String(Math.floor(100000000 + Math.random() * 900000000));
  }

  apply();
  const observer = new MutationObserver(() => apply());
  observer.observe(form, { childList: true, subtree: true });
}

const EMAIL_OTP_PANEL_CONFIGS = [
  { panelSel: '.field-primary-email-panel', verifyBtnSel: 'button[name="primary_email_verify_button"]', dataKey: 'primaryEmailWired' },
  { panelSel: '.field-work-email-panel', verifyBtnSel: 'button[name="work_email_verify_button"]', dataKey: 'workEmailWired' },
];

function decorateEmailOtpPanels(form) {
  function wirePanel({ panelSel, verifyBtnSel, dataKey }) {
    const panelEl = form.querySelector(panelSel);
    if (!panelEl || panelEl.dataset[dataKey]) return;

    const emailInput = panelEl.querySelector('input[type="email"]');
    const verifyBtn = panelEl.querySelector(verifyBtnSel);
    const otpPanel = panelEl.querySelector('.field-enter-otp-panel');
    if (!emailInput || !verifyBtn || !otpPanel) return;

    panelEl.dataset[dataKey] = 'true';
    otpPanel.style.display = 'none';

    const otpInput = otpPanel.querySelector('.field-otp input');
    const submitOtpBtn = otpPanel.querySelector('.field-submit-otp button');

    if (submitOtpBtn && !submitOtpBtn.dataset.emailOtpSubmitWired) {
      submitOtpBtn.dataset.emailOtpSubmitWired = 'true';
      submitOtpBtn.disabled = true;

      // Clear error and re-enable submit as user types a fresh OTP
      otpInput?.addEventListener('input', () => {
        otpPanel.querySelector('.otp-error-msg')?.remove();
        submitOtpBtn.disabled = (otpInput.value.replace(/\s/g, '').length < 6);
      });

      submitOtpBtn.addEventListener('click', () => {
        const entered = (otpInput?.value || '').replace(/\s/g, '');
        const expected = form.dataset.generatedOtp;

        if (!expected || entered !== expected) {
          const fieldOtp = otpInput?.closest('.field-otp');
          if (fieldOtp) {
            let errEl = fieldOtp.querySelector('.otp-error-msg');
            if (!errEl) {
              errEl = document.createElement('span');
              errEl.className = 'otp-error-msg';
              fieldOtp.append(errEl);
            }
            errEl.textContent = 'OTP Entered is invalid.';
          }
          submitOtpBtn.disabled = true;
          return;
        }

        // Correct OTP — collapse panel and mark verified
        otpPanel.querySelector('.otp-error-msg')?.remove();
        otpPanel.style.display = 'none';
        verifyBtn.textContent = 'Verified';
        verifyBtn.disabled = true;
        verifyBtn.classList.add('email-verified');
      });
    }

    const checkEmail = () => { verifyBtn.disabled = !isValidEmail(emailInput.value); };
    checkEmail();
    emailInput.addEventListener('input', checkEmail);

    verifyBtn.addEventListener('click', () => {
      if (!isValidEmail(emailInput.value)) return;

      otpPanel.style.display = '';

      // Reset wiring so timer starts fresh
      delete otpPanel.dataset.otpTimerWired;
      const resendBtn = otpPanel.querySelector('.field-resend button');
      if (resendBtn) delete resendBtn.dataset.timerWired;

      // Generate and fill OTP
      const otp = String(Math.floor(100000 + Math.random() * 900000));
      form.dataset.generatedOtp = otp;
      if (otpInput) {
        otpInput.value = otp;
        otpInput.dispatchEvent(new Event('input', { bubbles: true }));
      }

      wirePanelOtpTimer(otpPanel, form);

      verifyBtn.textContent = 'OTP Sent';
      verifyBtn.disabled = true;
      verifyBtn.classList.remove('email-verified');
    });
  }

  function wire() { EMAIL_OTP_PANEL_CONFIGS.forEach(wirePanel); }

  wire();
  const observer = new MutationObserver(() => wire());
  observer.observe(form, { childList: true, subtree: true });
}

const SALARY_BANK_DATA = {
  hdfc:           { name: 'HDFC Bank',             ifscPrefix: 'HDFC0' },
  icici_bank:     { name: 'ICICI Bank',             ifscPrefix: 'ICIC0' },
  axis:           { name: 'Axis Bank',              ifscPrefix: 'UTIB0' },
  kotak:          { name: 'Kotak Mahindra Bank',    ifscPrefix: 'KKBK0' },
  sbi:            { name: 'State Bank of India',    ifscPrefix: 'SBIN0' },
  bank_of_baroda: { name: 'Bank of Baroda',         ifscPrefix: 'BARB0' },
  idfc_first_bank:{ name: 'IDFC First Bank',        ifscPrefix: 'IDFB0' },
  'Union Bank':   { name: 'Union Bank of India',    ifscPrefix: 'UBIN0' },
  Others:         { name: 'Others',                 ifscPrefix: 'OTHR0' },
};

const PANEL_GATED_BUTTONS = ['confirm_button', 'Continue'];

function decorateConfirmButton(form) {
  function getPanel(btn) {
    let el = btn.parentElement;
    while (el && el !== form) {
      if (el.tagName === 'FIELDSET' && el.classList.contains('panel-wrapper')) return el;
      el = el.parentElement;
    }
    return null;
  }

  function allFilled(panel) {
    const fields = [...panel.querySelectorAll('input, select, textarea')].filter((f) => {
      if (f.type === 'submit' || f.type === 'button' || f.type === 'hidden') return false;
      if (f.disabled) return false;
      if (f.type === 'radio' || f.type === 'checkbox') return false;
      if (f.closest('.field-submit-otp, .field-resend, .field-back')) return false;
      const wrapper = f.closest('[class*="-wrapper"]');
      if (!wrapper) return false;
      if (getComputedStyle(wrapper).display === 'none') return false;
      return true;
    });
    return fields.every((f) => (f.value || '').trim() !== '');
  }

  function wireBtn(btn) {
    if (btn.dataset.confirmWired) return;
    const panel = getPanel(btn);
    if (!panel) return;

    btn.dataset.confirmWired = 'true';
    btn.disabled = !allFilled(panel);

    panel.addEventListener('input', () => { btn.disabled = !allFilled(panel); });
    panel.addEventListener('change', () => { btn.disabled = !allFilled(panel); });
  }

  function wire() {
    PANEL_GATED_BUTTONS.forEach((name) => {
      form.querySelectorAll(`button[name="${name}"]`).forEach(wireBtn);
    });
  }

  wire();
  const observer = new MutationObserver(() => wire());
  observer.observe(form, { childList: true, subtree: true });
}

function decorateSalaryAccountDetails(form) {
  function randDigits(n) {
    return Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('');
  }

  function fill(bankKey) {
    const data = SALARY_BANK_DATA[bankKey];
    if (!data) return;

    const acInput = form.querySelector('.field-salary-ac-number input');
    const ifscInput = form.querySelector('.field-ifsc input');
    const bankInput = form.querySelector('.field-bank-name input');

    if (acInput) acInput.value = randDigits(12);
    if (ifscInput) ifscInput.value = data.ifscPrefix + randDigits(6);
    if (bankInput) bankInput.value = data.name;

    [acInput, ifscInput, bankInput].forEach((el) => {
      if (el) el.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  function wire() {
    const radios = [...form.querySelectorAll('input[name="salary_bank_quick_select"]')];
    const dropdown = form.querySelector('select[name="salary_bank_dropdown"]');

    // Radio buttons — selecting one clears the dropdown
    radios.forEach((radio) => {
      if (radio.dataset.salaryBankWired) return;
      radio.dataset.salaryBankWired = 'true';
      radio.addEventListener('change', () => {
        if (!radio.checked) return;
        if (dropdown) dropdown.value = '';   // clear dropdown selection
        fill(radio.value);
      });
      if (radio.checked) fill(radio.value);
    });

    // Dropdown — selecting one unchecks all radio buttons
    if (dropdown && !dropdown.dataset.salaryBankWired) {
      dropdown.dataset.salaryBankWired = 'true';
      dropdown.addEventListener('change', () => {
        if (!dropdown.value) return;
        radios.forEach((r) => { r.checked = false; }); // clear radio selection
        fill(dropdown.value);
      });
      if (dropdown.value) fill(dropdown.value);
    }
  }

  wire();
  const observer = new MutationObserver(() => wire());
  observer.observe(form, { childList: true, subtree: true });
}

function decorateWorkEmailSync(form) {
  function wire() {
    const source = form.querySelector('input[name="email_id"]');
    const target = form.querySelector('input[name="primary_email_id"]');
    if (!source || !target || source.dataset.primaryEmailSynced) return;
    source.dataset.primaryEmailSynced = 'true';
    const sync = () => { target.value = source.value; };
    source.addEventListener('input', sync);
    source.addEventListener('change', sync);
    if (source.value) sync();
  }
  wire();
  const observer = new MutationObserver(() => wire());
  observer.observe(form, { childList: true, subtree: true });
}

function decorateEmployerAddressSync(form) {
  function getSelectedText(select) {
    const opt = select.options[select.selectedIndex];
    return (opt && opt.value) ? (opt.text || opt.value) : '';
  }

  function relabelReviewFields() {
    ['.field-loan-details', '.field-xpress-personal-loan-summary-panel'].forEach((sel) => {
      const panel = form.querySelector(sel);
      if (!panel) return;
      panel.querySelectorAll('.text-wrapper').forEach((wrapper) => {
        const label = wrapper.querySelector('label');
        if (!label || label.dataset.relabeled) return;
        if (label.textContent.trim().toLowerCase().includes('employer')) {
          label.textContent = 'Employer/Company Name';
          label.dataset.relabeled = 'true';
        }
      });
    });
  }

  function syncToReview(val) {
    ['.field-loan-details', '.field-xpress-personal-loan-summary-panel'].forEach((sel) => {
      const panel = form.querySelector(sel);
      if (!panel) return;
      panel.querySelectorAll('.text-wrapper').forEach((wrapper) => {
        const label = wrapper.querySelector('label');
        const input = wrapper.querySelector('input');
        if (!label || !input) return;
        if (label.textContent.trim().toLowerCase().includes('employer')) {
          input.value = val;
          input.dataset.employerControlled = 'true';
        }
      });
    });
  }

  function syncOtherToOfficeAddress(val) {
    const officePanel = form.querySelector('.field-office-address-panel');
    if (!officePanel) return;
    officePanel.querySelectorAll('.text-wrapper').forEach((wrapper) => {
      const label = wrapper.querySelector('label');
      const input = wrapper.querySelector('input');
      if (!label || !input) return;
      const t = label.textContent.trim().toLowerCase();
      if (t.includes('current employer') || t.includes('employer address')) {
        input.value = val;
      }
    });
  }

  function wireOtherInput() {
    const otherInput = form.querySelector('input[name="employer_company_name_other"]');
    if (!otherInput || otherInput.dataset.officeAddrSynced) return;
    otherInput.dataset.officeAddrSynced = 'true';
    otherInput.dataset.skipGeneralSync = 'true';
    const sync = () => syncOtherToOfficeAddress(otherInput.value);
    otherInput.addEventListener('input', sync);
    otherInput.addEventListener('change', sync);
    if (otherInput.value) sync();
  }

  function wire() {
    relabelReviewFields();
    wireOtherInput();

    const employerPanel = form.querySelector('.field-employer-details-panel');
    if (!employerPanel) return;

    // Find the Employer/Company Name dropdown by its label, not just the first select
    let dropdown = null;
    employerPanel.querySelectorAll('select').forEach((sel) => {
      if (dropdown) return;
      const wrapper = sel.closest('[class*="-wrapper"]');
      const label = wrapper?.querySelector('label');
      if (!label) return;
      const t = label.textContent.trim().toLowerCase();
      if (t.includes('employer') || t.includes('company')) {
        dropdown = sel;
      }
    });

    // Also wire directly by name in case label-based lookup fails
    const namedSelect = form.querySelector('select[name="employer_company_name_select"]');
    const targetDropdown = namedSelect || dropdown;

    if (!targetDropdown || targetDropdown.dataset.employerSynced) return;
    targetDropdown.dataset.employerSynced = 'true';
    targetDropdown.dataset.skipGeneralSync = 'true';

    const sync = () => {
      const opt = targetDropdown.options[targetDropdown.selectedIndex];
      const val = (opt && opt.value) ? (opt.text || opt.value) : '';
      if (!val) return;
      const employerNameInput = form.querySelector('input[name="employer_name"]');
      if (employerNameInput) {
        employerNameInput.value = val;
        employerNameInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
      setTimeout(() => syncToReview(val), 0);
    };

    targetDropdown.addEventListener('change', sync);
    if (targetDropdown.value) sync();
  }

  wire();
  const observer = new MutationObserver(() => wire());
  observer.observe(form, { childList: true, subtree: true });
}

function decorateSummarySync(form) {
  const REVIEW_PANELS = [
    '.field-loan-details',
    '.field-xpress-personal-loan-summary-panel',
    '.field-personal-details',
  ];

  function getReviewFields() {
    const map = new Map();
    REVIEW_PANELS.forEach((sel) => {
      const panel = form.querySelector(sel);
      if (!panel) return;
      panel.querySelectorAll('input[type="text"], input:not([type="range"]):not([type="checkbox"]):not([type="radio"]):not([type="submit"]):not([type="button"])').forEach((input) => {
        if (input.dataset.employerControlled) return;
        const wrapper = input.closest('[class*="-wrapper"]');
        const label = wrapper?.querySelector('label');
        if (!label) return;
        const key = label.textContent.trim().toLowerCase();
        if (!key) return;
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(input);
      });
    });
    return map;
  }

  function labelsMatch(sourceKey, reviewKey) {
    if (sourceKey === reviewKey) return true;
    const toWordSet = (str) => new Set(str.split(/\W+/).filter((w) => w.length >= 2));
    const sourceWords = toWordSet(sourceKey);
    const reviewWords = reviewKey.split(/\W+/).filter((w) => w.length >= 3);
    if (reviewWords.length === 0) return false;
    return reviewWords.every((w) => sourceWords.has(w));
  }

  function getDisplayValue(input) {
    if (input.tagName === 'SELECT') {
      const opt = input.options[input.selectedIndex];
      return (opt && opt.value) ? (opt.text || opt.value) : '';
    }
    return input.value;
  }

  function getRadioGroupInfo(radioName) {
    const firstRadio = form.querySelector(`input[type="radio"][name="${radioName}"]`);
    if (!firstRadio) return null;
    const fieldset = firstRadio.closest('fieldset');
    const legend = fieldset?.querySelector(':scope > legend');
    if (!legend) return null;
    const groupLabel = legend.textContent.trim().toLowerCase();
    const checked = form.querySelector(`input[type="radio"][name="${radioName}"]:checked`);
    if (!checked) return { groupLabel, val: '' };
    const optLabel = form.querySelector(`label[for="${checked.id}"]`)
      || checked.closest('.option-wrapper, .field-wrapper')?.querySelector('label');
    const val = optLabel ? optLabel.textContent.trim() : (checked.value || '');
    return { groupLabel, val };
  }

  function syncToReview(sourceInput) {
    if (REVIEW_PANELS.some((s) => sourceInput.closest(s))) return;
    const wrapper = sourceInput.closest('[class*="-wrapper"]');
    const label = wrapper?.querySelector('label');
    if (!label) return;
    const sourceKey = label.textContent.trim().toLowerCase();
    if (!sourceKey) return;

    const val = getDisplayValue(sourceInput);
    const reviewFields = getReviewFields();
    reviewFields.forEach((inputs, key) => {
      if (labelsMatch(sourceKey, key)) {
        inputs.forEach((inp) => { inp.value = val; });
      }
    });
  }

  function syncAllToReview() {
    const reviewFields = getReviewFields();
    if (reviewFields.size === 0) return;

    // Sync text/select/textarea fields
    form.querySelectorAll('input[type="text"], input[type="email"], input[type="tel"], input[type="number"], input[type="date"], select, textarea').forEach((input) => {
      if (REVIEW_PANELS.some((s) => input.closest(s))) return;
      if (input.dataset.skipGeneralSync) return;
      const val = getDisplayValue(input);
      if (!val || !val.trim()) return;
      const wrapper = input.closest('[class*="-wrapper"]');
      const label = wrapper?.querySelector('label');
      if (!label) return;
      const sourceKey = label.textContent.trim().toLowerCase();
      if (!sourceKey) return;
      reviewFields.forEach((inputs, key) => {
        if (labelsMatch(sourceKey, key)) {
          inputs.forEach((inp) => { inp.value = val; });
        }
      });
    });

    // Sync radio groups (e.g. Type of Loan)
    const seenNames = new Set();
    form.querySelectorAll('input[type="radio"]').forEach((radio) => {
      if (REVIEW_PANELS.some((s) => radio.closest(s))) return;
      if (seenNames.has(radio.name)) return;
      seenNames.add(radio.name);
      const info = getRadioGroupInfo(radio.name);
      if (!info || !info.val) return;
      reviewFields.forEach((inputs, key) => {
        if (labelsMatch(info.groupLabel, key)) {
          inputs.forEach((inp) => { inp.value = info.val; });
        }
      });
    });
  }

  function wire() {
    form.querySelectorAll('input[type="text"], input[type="email"], input[type="tel"], input[type="number"], input[type="date"], select, textarea').forEach((input) => {
      if (input.dataset.reviewSyncWired) return;
      if (REVIEW_PANELS.some((s) => input.closest(s))) return;
      if (input.dataset.skipGeneralSync) return;
      input.dataset.reviewSyncWired = 'true';
      input.addEventListener('input', () => syncToReview(input));
      input.addEventListener('change', () => syncToReview(input));
    });

    // Wire radio groups
    form.querySelectorAll('input[type="radio"]').forEach((radio) => {
      if (radio.dataset.reviewSyncWired) return;
      if (REVIEW_PANELS.some((s) => radio.closest(s))) return;
      radio.dataset.reviewSyncWired = 'true';
      radio.addEventListener('change', () => syncAllToReview());
    });
  }

  wire();
  // Also observe attribute changes (class, data-active) so wizard step navigation triggers sync
  const observer = new MutationObserver(() => { wire(); syncAllToReview(); });
  observer.observe(form, {
    childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'data-active', 'data-visible'],
  });
}

export default async function decorate(block) {
  let container = block.querySelector('a[href]');
  let formDef;
  let pathname;
  if (container) {
    ({ pathname } = new URL(container.href));
    formDef = await fetchForm(container.href);
  } else {
    ({ container, formDef } = extractFormDefinition(block));
  }
  let source = 'aem';
  let rules = true;
  let form;
  if (formDef) {
    const submitProps = formDef?.properties?.['fd:submit'];
    const actionType = submitProps?.actionName || formDef?.properties?.actionType;
    const spreadsheetUrl = submitProps?.spreadsheet?.spreadsheetUrl
      || formDef?.properties?.spreadsheetUrl;

    if (actionType === 'spreadsheet' && spreadsheetUrl) {
      // Check if we're in an iframe and use parent window path if available
      const iframePath = window.frameElement ? window.parent.location.pathname
        : window.location.pathname;
      formDef.action = SUBMISSION_SERVICE + btoa(pathname || iframePath);
    } else {
      formDef.action = getSubmitBaseUrl() + (formDef.action || '');
    }
    if (isDocumentBasedForm(formDef)) {
      const transform = new DocBasedFormToAF();
      formDef = transform.transform(formDef);
      source = 'sheet';
      const response = await createForm(formDef);
      form = response?.form;
      const docRuleEngine = await import('./rules-doc/index.js');
      docRuleEngine.default(formDef, form);
      rules = false;
    } else {
      afModule = await import('./rules/index.js');
      addRequestContextToForm(formDef);
      if (afModule && afModule.initAdaptiveForm && !block.classList.contains('edit-mode')) {
        form = await afModule.initAdaptiveForm(formDef, createForm);
      } else {
        form = await createFormForAuthoring(formDef);
      }
    }
    form.dataset.redirectUrl = formDef.redirectUrl || '';
    form.dataset.thankYouMsg = formDef.thankYouMsg || '';
    form.dataset.action = formDef.action || pathname?.split('.json')[0];
    form.dataset.source = source;
    form.dataset.rules = rules;
    form.dataset.id = formDef.id;
    if (source === 'aem' && formDef.properties && formDef.properties['fd:path']) {
      form.dataset.formpath = formDef.properties['fd:path'];
    }
    container.replaceWith(form);
    decorateOtpInput(form);
    decorateOtpTimer(form);
    wireEligibilityOtpClick(form);
    decorateEditMobileNumber(form);
    decorateLoanSliders(form);
    decorateLoanAmountFromIncome(form);
    decorateCollapsiblePanels(form);
    decorateLoanEligibilityButton(form);
    decorateSubmitOtpButton(form);
    decorateMoveSubmitButton(form);
    decorateEmailVerifyJoined(form);
    decoratePanVerify(form);
    decorateBankSelector(form);
    decorateIncomeVerification(form);
    decorateLoanApplicationNumber(form);
    decorateRandomCustomerData(form);
    decorateWorkEmailSync(form);
    decorateEmailOtpPanels(form);
    decorateSalaryAccountDetails(form);
    decorateConfirmButton(form);
    decorateEmployerAddressSync(form);
    decorateSummarySync(form);

    // Wrap "here" in consent labels so it can be styled blue
    form.querySelectorAll('.field-consent-communication label, .field-consent-marketing label').forEach((label) => {
      if (!label.querySelector('a, .here-link')) {
        label.innerHTML = label.innerHTML.replace(/\bhere\b(?=\.)/, '<span class="here-link">here</span>');
      }
    });

  }
}
