'use client';

import Image from "next/image";
import OpenAI from "openai";

const Test = () => {
  // Handles the submit event on form submit.
  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    // Stop the form from submitting and refreshing the page.
    event.preventDefault()

    // const targetUrl = 'https://sundae.school/collections/fleeces/products/broccoli-fleece-zip-up-collab-x-paulo-pastel';
    // fetch(`https://cors-anywhere.herokuapp.com/${targetUrl}`, {
    //   method: 'GET',
    //   headers: {
    //     'X-Requested-With': 'XMLHttpRequest',
    //   },
    // })
    //   .then((response) => response.text())
    //   .then((htmlString) => {
    //     const parser = new DOMParser();
    //     const doc = parser.parseFromString(htmlString, 'text/html');
    //     const headContent = doc.head.innerHTML;
    //     console.log(headContent);
    //   })
    //   .catch((error) => console.error('Error:', error));


    // console.log(`The api key is ${process.env.NEXT_PUBLIC_OPENAI_API_KEY}`);
    const data = '[<meta charset="utf-8" />, <meta content="IE=edge" http-equiv="X-UA-Compatible" />, <meta content="width=device-width,initial-scale=1" name="viewport" />, <meta content="" name="theme-color" />, <meta content="The epsom green box fit logo t-shirt for men has an oversized silhouette with dropped shoulders and a ribbed crewneck with each tee cut from 320gsm cotton." name="description" />, <meta content="about:blank" property="og:site_name" />, <meta content="https://about---blank.com/en-us/products/box-t-shirt-epsom-green" property="og:url" />, <meta content="about:blank | epsom green boxy oversized t-shirt" property="og:title" />, <meta content="product" property="og:type" />, <meta content="The epsom green box fit logo t-shirt for men has an oversized silhouette with dropped shoulders and a ribbed crewneck with each tee cut from 320gsm cotton." property="og:description" />, <meta content="http://about---blank.com/cdn/shop/products/about-blankcombox-t-shirt-epsom-green-116182.jpg?v=1692808973" property="og:image" />, <meta content="https://about---blank.com/cdn/shop/products/about-blankcombox-t-shirt-epsom-green-116182.jpg?v=1692808973" property="og:image:secure_url" />, <meta content="1365" property="og:image:width" />, <meta content="2048" property="og:image:height" />, <meta content="87.00" property="og:price:amount" />, <meta content="USD" property="og:price:currency" />, <meta content="summary_large_image" name="twitter:card" />, <meta content="about:blank | epsom green boxy oversized t-shirt" name="twitter:title" />, <meta content="The epsom green box fit logo t-shirt for men has an oversized silhouette with dropped shoulders and a ribbed crewneck with each tee cut from 320gsm cotton." name="twitter:description" />, <meta content="t3vbavIrN4W_e9-rbKafJaAL8uShi_WZzLC1VmwZ20w" name="google-site-verification" />, <meta content="/51776291012/digital_wallets/dialog" id="shopify-digital-wallet" name="shopify-digital-wallet" />, <meta content="02ea0fecfe53cfd140a43a3a681e98f9" name="shopify-checkout-api-token" />, <meta data-currency="USD" data-environment="production" data-locale="en_US" data-paypal-v4="true" data-shop-id="51776291012" data-venmo-supported="false" id="in-context-paypal-metadata" />]'

    const responseJson = "{ 'name': '', 'description': '', 'images': [] }";
    const openai = new OpenAI({
      apiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY,
      dangerouslyAllowBrowser: true
    });
    const completion = await openai.chat.completions.create({
      messages: [{
        role: "system",
        content: `You are a backend API that when given a list of HTML tags, you return 
          the name of the product, a description, and image links. You return
          the results in the json format ${responseJson} and nothing else. The data you
          are given is ${data}.`
      }],
      model: "gpt-3.5-turbo-0125",
      response_format: { type: "json_object" },
    });

    const result = JSON.parse(completion.choices[0]['message']['content']);

    console.log(result);
    console.log(result['images'][0]);
  }

  return (
    <div className="container mx-auto bg-gray-200 rounded-xl shadow border p-8 m-10">
      <p className="text-3xl text-gray-700 font-bold mb-5">
        Type something!
      </p>
      <form onSubmit={handleSubmit}>
        <input type="text" id="prompt" name="prompt"
          className="shadow 
          appearance-none border rounded 
          w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
          required />
        <button type="submit" className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded">Submit</button>
      </form>
    </div>
  );
}

export default Test;
