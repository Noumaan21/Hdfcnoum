import { DEFAULT_THANK_YOU_MESSAGE, getSubmitBaseUrl } from './constant.js';

export function submitSuccess(e, form) {
  const { payload } = e;
  const redirectUrl = form.dataset.redirectUrl || payload?.body?.redirectUrl;
  if (redirectUrl) {
    window.location.assign(encodeURI(redirectUrl));
  } else {
    const applicationNumber = payload?.body?.applicationNumber || '';
    const loanAmount = payload?.body?.loanAmount ?? 0;

    let thankYouMessage = form.parentNode.querySelector('.form-message.success-message');
    if (!thankYouMessage) {
      thankYouMessage = document.createElement('div');
      thankYouMessage.className = 'form-message success-message';
    }

    thankYouMessage.innerHTML = `
      <h2 class="thankyou-title">Thank You for submitting form</h2>
      <div class="thankyou-card">
        <div class="thankyou-card-top">
          <div class="thankyou-icon">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
              <rect width="64" height="64" rx="10" fill="#EEF4FF"/>
              <path d="M20 14h16l8 8v28a2 2 0 0 1-2 2H20a2 2 0 0 1-2-2V16a2 2 0 0 1 2-2z" stroke="#4A7FD4" stroke-width="2" fill="#fff"/>
              <path d="M36 14v8h8" stroke="#4A7FD4" stroke-width="2" fill="none"/>
              <line x1="24" y1="28" x2="40" y2="28" stroke="#4A7FD4" stroke-width="2" stroke-linecap="round"/>
              <line x1="24" y1="34" x2="40" y2="34" stroke="#4A7FD4" stroke-width="2" stroke-linecap="round"/>
              <line x1="24" y1="40" x2="33" y2="40" stroke="#4A7FD4" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </div>
          <div class="thankyou-details">
            <span class="thankyou-label">Loan Application Number</span>
            <span class="thankyou-app-number">${applicationNumber}</span>
            <p class="thankyou-subtext">We may call or email you, if needed.</p>
          </div>
        </div>
        <hr class="thankyou-divider"/>
        <div class="thankyou-summary">
          <h3 class="thankyou-summary-title">Xpress Personal Loan Summary</h3>
          <div class="thankyou-summary-item">
            <span class="thankyou-summary-label">Loan Amount</span>
            <span class="thankyou-summary-value">&#8377;${loanAmount}</span>
          </div>
        </div>
      </div>
      <div class="thankyou-info-bar">
        You will receive your loan in your registered account on successful completion subject to your KYC and internal policies and guidelines.
      </div>
    `;

    form.parentNode.insertBefore(thankYouMessage, form);
    if (thankYouMessage.scrollIntoView) {
      thankYouMessage.scrollIntoView({ behavior: 'smooth' });
    }
    form.reset();
  }
  form.setAttribute('data-submitting', 'false');
  form.querySelector('button[type="submit"]').disabled = false;
}

export function submitFailure(e, form) {
  let errorMessage = form.querySelector('.form-message.error-message');
  if (!errorMessage) {
    errorMessage = document.createElement('div');
    errorMessage.className = 'form-message error-message';
  }
  errorMessage.innerHTML = 'Some error occured while submitting the form'; // TODO: translation
  form.prepend(errorMessage);
  errorMessage.scrollIntoView({ behavior: 'smooth' });
  form.setAttribute('data-submitting', 'false');
  form.querySelector('button[type="submit"]').disabled = false;
}

function generateUnique() {
  return new Date().valueOf() + Math.random();
}

function getFieldValue(fe, payload) {
  if (fe.type === 'radio') {
    return fe.form.elements[fe.name].value;
  } if (fe.type === 'checkbox') {
    if (payload[fe.name]) {
      if (fe.checked) {
        return `${payload[fe.name]},${fe.value}`;
      }
      return payload[fe.name];
    } if (fe.checked) {
      return fe.value;
    }
  } else if (fe.type !== 'file') {
    return fe.value;
  }
  return null;
}

function constructPayload(form) {
  const payload = { __id__: generateUnique() };
  [...form.elements].forEach((fe) => {
    if (fe.name && !fe.matches('button') && !fe.disabled && fe.tagName !== 'FIELDSET') {
      const value = getFieldValue(fe, payload);
      if (fe.closest('.repeat-wrapper')) {
        payload[fe.name] = payload[fe.name] ? `${payload[fe.name]},${fe.value}` : value;
      } else {
        payload[fe.name] = value;
      }
    }
  });
  return { payload };
}

async function prepareRequest(form) {
  const { payload } = constructPayload(form);
  const headers = {
    'Content-Type': 'application/json',
    // eslint-disable-next-line comma-dangle
    'x-adobe-form-hostname': window?.location?.hostname
  };
  const body = { data: payload };
  let url;
  let baseUrl = getSubmitBaseUrl();
  if (!baseUrl) {
    // eslint-disable-next-line prefer-template
    baseUrl = 'https://forms.adobe.com/adobe/forms/af/submit/';
    url = baseUrl + btoa(`${form.dataset.action}.json`);
  } else {
    url = form.dataset.action;
  }
  return { headers, body, url };
}

async function submitDocBasedForm(form, captcha) {
  try {
    const { headers, body, url } = await prepareRequest(form, captcha);
    let token = null;
    if (captcha) {
      token = await captcha.getToken();
      body.data['g-recaptcha-response'] = token;
    }
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    if (response.ok) {
      submitSuccess(response, form);
    } else {
      const error = await response.text();
      throw new Error(error);
    }
  } catch (error) {
    submitFailure(error, form);
  }
}

export async function handleSubmit(e, form, captcha) {
  e.preventDefault();
  const valid = form.checkValidity();
  if (valid) {
    e.submitter?.setAttribute('disabled', '');
    if (form.getAttribute('data-submitting') !== 'true') {
      form.setAttribute('data-submitting', 'true');

      // hide error message in case it was shown before
      form.querySelectorAll('.form-message.show').forEach((el) => el.classList.remove('show'));

      if (form.dataset.source === 'sheet') {
        await submitDocBasedForm(form, captcha);
      }
    }
  } else {
    const firstInvalidEl = form.querySelector(':invalid:not(fieldset)');
    if (firstInvalidEl) {
      firstInvalidEl.focus();
      firstInvalidEl.scrollIntoView({ behavior: 'smooth' });
    }
  }
}
