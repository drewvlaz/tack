"use server";

import OpenAI from "openai";
import { parse } from "node-html-parser";

const parseData = async (targetUrl: string) => {
  const product = {
    name: "Product Name",
    Brand: "Brand Name",
    price: "$10.99",
    material: "Unknown",
    images: [
      "https://sundae.school/cdn/shop/products/D7_Broccoli_F_006_d04d6c83-5a08-4f82-ac5f-53b85c5a6908_600x600.jpg?v=1668031218",
    ],
  };
  return product;

  const response = await fetch(targetUrl, { method: "GET" });
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const htmlString = await response.text();
  const root = parse(htmlString);
  const metaTags = root.querySelectorAll("meta");

  const data = metaTags.map((meta) => meta.getAttribute("content"));

  const responseJson =
    "{ 'name': '', 'brand': '', 'price':'', 'material': '', 'images': [] }";
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    dangerouslyAllowBrowser: true,
  });
  const completion = await openai.chat.completions.create({
    messages: [
      {
        role: "system",
        content:
          `You are a backend API that when given a list of HTML meta tags, you return \
        the details of the product in the json format ${responseJson} and nothing else. The data you \
        are given is ${data}. If you cannot determine the material, return "Unknown". \
        Return the price as a string beginning with the currency symbol (e.g. $10.99). \
        For the images, if there are both http and https links, \
        you should return the https links and no duplicates.`
            .replace(/\s+/g, " ")
            .trim(),
      },
    ],
    model: "gpt-3.5-turbo-0125",
    response_format: { type: "json_object" },
  });

  const content = completion.choices[0]["message"]["content"];
  return content !== null ? JSON.parse(content) : null;
};

export default parseData;
