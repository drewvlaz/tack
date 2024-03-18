"use server";

import OpenAI from "openai";
import { parse } from "node-html-parser";

const parseData = async (targetUrl: string) => {
  // const p = new Promise((resolve) => setTimeout(resolve, 1000));
  // await p;
  // const res = {
  //   name: "Product Name",
  //   brand: "Brand",
  //   material: "Material",
  //   description: "Description",
  //   images: ["https://sundae.school/cdn/shop/products/D7_broc_002_bbfcad3f-02a8-4c79-ae51-9c9a827393d0_600x600.jpg?v=1668031218"]
  // };
  // return res;

  const response = await fetch(targetUrl, { method: "GET" });
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const htmlString = await response.text();
  const root = parse(htmlString);
  const metaTags = root.querySelectorAll("meta");

  const data = metaTags.map((meta) => meta.getAttribute("content"));

  const responseJson =
    "{ 'name': '', 'brand': '', 'material': '', 'description': '', 'images': [] }";
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
