const createNodeHelpers = require('gatsby-node-helpers').default;
const fetch = require('node-fetch');
const queryString = require('query-string');

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
        console.info('All form ids correctly fetched');
        return response.json();
      })
      .catch((error) => {
        console.error('Error trying to fetch the forms >>>> ', error);
      });

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
        const { result: children } = await fetchFormFields(form.id);
        const Form = createNodeFactory('Form')({
          ...form,
          children,
        });

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
