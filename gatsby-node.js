const createNodeHelpers = require('gatsby-node-helpers').default;
const fetch = require('node-fetch');
const queryString = require('query-string');

const wait = (ms) => new Promise((res) => setTimeout(res, ms));

const callWithRetry = async (fn, depth = 0) => {
  try {
    console.info(
      `Correctly calling the function during the attempt number ${depth + 1}`
    );
    return await fn();
  } catch (e) {
    if (depth > 5) {
      console.error('Attempt limit reached, impossible to fetch');
      throw e;
    }
    console.error(e);
    console.info(
      `Impossible to fetch the data during the attempt number ${
        depth + 1
      }, trying again in ${20 + 10 * depth}s`
    );
    await wait(20000 + 10000 * depth);

    return callWithRetry(fn, depth + 1);
  }
};

const { createNodeFactory } = createNodeHelpers({
  typePrefix: `Marketo`,
});

async function authenticate(authUrl) {
  const res = await fetch(authUrl, {});

  if (res.ok) {
    const { access_token } = await res.json();

    return access_token;
  } else {
    throw new Error('Wrong credentials');
  }
}

exports.sourceNodes = async ({ actions, createNodeId }, configOptions) => {
  const { createNode } = actions;
  const { munchkinId, clientId, clientSecret } = configOptions;
  const authOptions = queryString.stringify({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
  });

  const formsApiUrl = `https://${munchkinId}.mktorest.com/rest/asset/v1/forms.json?maxReturn=200`;
  const authUrl = `https://${munchkinId}.mktorest.com/identity/oauth/token?${authOptions}`;

  try {
    const accessToken = await authenticate(authUrl);

    const forms = await fetch(formsApiUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((response) => {
        console.info('All forms correctly fetched');
        return response.json();
      })
      .catch((error) => {
        console.error('Error trying to fetch the forms >>>> ', error);
      });

    console.info('Here are the forms fetched >>>>', forms);

    async function fetchFormFields(id) {
      const url = `https://${munchkinId}.mktorest.com/rest/asset/v1/form/${id}/fields.json`;

      const results = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
        .then((res) => {
          console.log('Fields correctly fetched for the form with the id ', id);
          return res.json();
        })
        .catch((error) => {
          console.error(
            `Error trying to fetch the form id ${id} fields >>>> `,
            error
          );
        });

      return results;
    }

    await Promise.all(
      forms.result.map(async (form) => {
        const { result: children } = await callWithRetry(() =>
          fetchFormFields(form.id)
        );
        const Form = createNodeFactory('Form')({
          ...form,
          children,
        });
        console.info(
          'Node created for form ID >>>> : ',
          Form.id,
          ' <<<< Name >>>> ',
          Form.name
        );

        createNode(Form);
      })
    )
      .then(() => {
        console.info('Form and fields successfully fetched');
      })
      .catch((error) => {
        console.error(
          'Error during the Promise.all phase >>>> ',
          error.message
        );
      });
  } catch (err) {
    console.error('gatsby-source-marketo-forms:', err.message);
  }
};
