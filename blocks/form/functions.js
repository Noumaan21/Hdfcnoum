/**
 * Get Full Name
 * @name getFullName Concats first name and last name
 * @param {string} firstname in Stringformat
 * @param {string} lastname in Stringformat
 * @return {string}
 */
function getFullName(firstname, lastname) {
  return `${firstname} ${lastname}`.trim();
}

/**
 * Custom submit function
 * @param {scope} globals
 */
function submitFormArrayToString(globals) {
  const data = globals.functions.exportData();
  Object.keys(data).forEach((key) => {
    if (Array.isArray(data[key])) {
      data[key] = data[key].join(',');
    }
  });
  globals.functions.submitForm(data, true, 'application/json');
}

/**
 * Calculate the number of days between two dates.
 * @param {*} endDate
 * @param {*} startDate
 * @returns {number} returns the number of days between two dates
 */
function days(endDate, startDate) {
  const start = typeof startDate === 'string' ? new Date(startDate) : startDate;
  const end = typeof endDate === 'string' ? new Date(endDate) : endDate;

  // return zero if dates are valid
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 0;
  }

  const diffInMs = Math.abs(end.getTime() - start.getTime());
  return Math.floor(diffInMs / (1000 * 60 * 60 * 24));
}

/**
* Masks the first 5 digits of the mobile number with *
* @param {*} mobileNumber
* @returns {string} returns the mobile number with first 5 digits masked
*/
function maskMobileNumber(mobileNumber) {
  if (!mobileNumber) {
    return '';
  }
  const value = mobileNumber.toString();
  // Mask first 5 digits and keep the rest
  return ` ${'*'.repeat(5)}${value.substring(5)}`;
}

const OTP_API_BASE = 'http://localhost:3000';

/**
 * Calls the backend to generate an OTP for the given mobile + DOB.
 * Wire this to your "Send OTP" button click rule.
 * @name generateOtp
 * @param {string} mobile - Mobile number from the form field
 * @param {string} dob - Date of birth from the form field (YYYY-MM-DD)
 * @param {scope} globals - AEM Forms globals (auto-injected by rule engine)
 * @return {void}
 */
async function generateOtp(mobile, dob, globals) {
  try {
    const res = await fetch(`${OTP_API_BASE}/api/generate-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobile, dob }),
    });
    const data = await res.json();
    if (!res.ok) {
      globalThis.alert(data.message || 'Failed to send OTP. Please try again.');
    }
  } catch {
    globalThis.alert('Network error while sending OTP. Please try again.');
  }
}

/**
 * Validates the OTP entered by the user.
 * On success → navigates to the next wizard panel.
 * On failure → marks the OTP field invalid with an error message.
 *
 * Wire this to your "Verify OTP" button click rule:
 *   validateOtp(mobileField, otpField, nextPanel)
 *
 * @name validateOtp
 * @param {string} mobile - Mobile number value
 * @param {string} otp - OTP value entered by user
 * @param {object} nextPanelRef - Reference to the next wizard panel (passed from rule editor)
 * @param {scope} globals - AEM Forms globals (auto-injected by rule engine)
 * @return {void}
 */
async function validateOtp(mobile, otp, nextPanelRef, globals) {
  try {
    const res = await fetch(`${OTP_API_BASE}/api/validate-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestString: {
          mobileNo: String(mobile),
          passwordValue: String(otp),
        },
      }),
    });
    const data = await res.json();

    if (data?.status?.responseCode === '0') {
      globals.functions.navigateTo(nextPanelRef);
    } else {
      const msg = data?.status?.errorDesc || 'Incorrect OTP. Please try again.';
      globals.functions.markFieldAsInvalid(
        globals.field.$qualifiedName,
        msg,
        { useQualifiedName: true },
      );
    }
  } catch {
    globalThis.alert('Network error while verifying OTP. Please try again.');
  }
}

// eslint-disable-next-line import/prefer-default-export
export {
  getFullName, days, submitFormArrayToString, maskMobileNumber, generateOtp, validateOtp,
};
