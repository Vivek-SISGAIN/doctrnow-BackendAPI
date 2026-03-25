const EMIRATES_ID_REGEX = /^784-(\d{4})-(\d{7})$/;

const parseYearFromDateOfBirth = (dateOfBirth) => {
  if (!dateOfBirth) {
    return null;
  }

  const parsedDate = new Date(dateOfBirth);
  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return parsedDate.getUTCFullYear().toString();
};

const validateEmiratesIdMatchesDobYear = (value, helpers) => {
  if (value == null) {
    return value;
  }

  const match = value.match(EMIRATES_ID_REGEX);
  if (!match) {
    return helpers.error('string.pattern.base');
  }

  const [, year] = match;
  const dobYear = parseYearFromDateOfBirth(helpers.state.ancestors[0]?.dateOfBirth);

  if (dobYear && year !== dobYear) {
    return helpers.error('emiratesId.dobYear');
  }

  return value;
};

module.exports = {
  EMIRATES_ID_REGEX,
  parseYearFromDateOfBirth,
  validateEmiratesIdMatchesDobYear
};
