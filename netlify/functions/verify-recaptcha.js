const RECAPTCHA_SECRET_KEY = process.env.RECAPTCHA_SECRET_KEY;

export const handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ success: false, message: 'Método não permitido.' }),
    };
  }

  if (!RECAPTCHA_SECRET_KEY) {
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, message: 'Servidor de reCAPTCHA não configurado.' }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (error) {
    return {
      statusCode: 400,
      body: JSON.stringify({ success: false, message: 'JSON inválido no corpo da requisição.' }),
    };
  }

  const { token, action } = body;
  if (!token) {
    return {
      statusCode: 400,
      body: JSON.stringify({ success: false, message: 'Token do reCAPTCHA faltando.' }),
    };
  }

  try {
    const params = new URLSearchParams();
    params.append('secret', RECAPTCHA_SECRET_KEY);
    params.append('response', token);

        const response = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const message = await response.text();
      return {
        statusCode: 502,
        body: JSON.stringify({ success: false, message: `reCAPTCHA siteverify falhou: ${response.status} ${message}` }),
      };
    }

    const result = await response.json();
    const valid = result.success && (!action || result.action === action) && result.score >= 0.4;

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: valid,
        score: result.score,
        action: result.action,
        errorCodes: result['error-codes'] || [],
      }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, message: error.message }),
    };
  }
}
