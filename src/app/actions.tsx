"use server";

import OpenAI from "openai";
import { parse, HTMLElement as ParsedHTMLElement } from "node-html-parser";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { OpenAI as LangchainOpenAI, ChatOpenAI } from "@langchain/openai";
import { PromptTemplate } from "@langchain/core/prompts";
import { loadSummarizationChain } from "langchain/chains";

const parseEntirePage = async (
  page: ParsedHTMLElement,
  finalJsonTags: string,
) => {
  const data = page.innerHTML;
  const tagsToRemove = page.querySelectorAll(
    "button, div, footer, noscript, path, script, style, span, svg, symbol",
  );
  const attributesToRemove = ["style", "srcset"];
  const allElements = page.querySelectorAll("*");

  tagsToRemove.forEach((item) => item.remove());
  allElements.forEach((elem) => {
    attributesToRemove.forEach((attr) => {
      elem.removeAttribute(attr);
    });
  });

  // const metaTags = root.querySelectorAll("meta");
  // const data = metaTags.map((meta) => meta.getAttribute("content"));
  // const data = root.innerHTML;
  // const tags = root.querySelectorAll(
  //   "meta, link, p, h1, h2, h3, h4, h5, h6, a, img, ul, ol, li, table, tr, td, th, span",
  // );

  // return tags.map((tag) => tag.outerHTML).join("\n");

  // https://api.js.langchain.com/classes/langchain_text_splitter.RecursiveCharacterTextSplitter.html
  const splitter = RecursiveCharacterTextSplitter.fromLanguage("html", {
    chunkSize: 10000,
    chunkOverlap: 20,
  });
  const docs = await splitter.createDocuments([data]);

  // return docs
  //   .map((doc) => doc.pageContent.replace(/\s+/g, " ").trim())
  //   .join("\n\n\n");

  const model = new LangchainOpenAI({
    openAIApiKey: process.env.OPENAI_API_KEY,
    modelName: "gpt-3.5-turbo-0125",
  });

  const combineModel = new LangchainOpenAI({
    openAIApiKey: process.env.OPENAI_API_KEY,
    modelName: "gpt-3.5-turbo",
    // maxTokens: 128,
    // callbacks: [
    //   {
    //     handleLLMNewToken(token: string): Promise<void> | void {
    //       console.log("token", token);
    //     },
    //   },
    // ],
    // }).bind({
    //   response_format: {
    //     type: "json_object",
    //   },
  });

  const mapPromptTemplate = new PromptTemplate({
    template: `
      Return the tags in the following HTML that relate
      to the product's name, brand, price, material, description, and images.
      Return the tags exactly as they appear in the HTML.
      {text}
    `
      .replace(/\s+/g, " ")
      .trim(),
    inputVariables: ["text"],
  });

  const combinePromptTemplate = new PromptTemplate({
    template:
      `You are a backend API that when given a list of HTML meta tags, you return \
      the details of the product in the json format ${finalJsonTags} and nothing else. \
      If you cannot determine the material, return "Unknown". \
      For the images, if there are both http and https links, \
      you should return the https links and no duplicates. The data you are given is {text}.`
        .replace(/\s+/g, " ")
        .trim(),
    inputVariables: ["text"],
  });

  const summaryChain = loadSummarizationChain(model, {
    type: "map_reduce",
    combineLLM: combineModel,
    combineMapPrompt: mapPromptTemplate,
    combinePrompt: combinePromptTemplate,
  });

  // TODO: switch to invoke() when typing issues fixed
  const res = await summaryChain.call({
    input_documents: docs,
  });

  return res;
};

const parseMetaTags = async (
  page: ParsedHTMLElement,
  finalJsonTags: string,
) => {
  const metaTags = page.querySelectorAll("meta");
  const data = metaTags.map((meta) => meta.getAttribute("content"));

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
          the details of the product in the json format ${finalJsonTags} and nothing else. \
          If you cannot determine the material, return "Unknown". \
          For the images, if there are both http and https links, \
          you should return the https links and no duplicates. The data you are given is ${data}.`
            .replace(/\s+/g, " ")
            .trim(),
      },
    ],
    model: "gpt-3.5-turbo",
    response_format: { type: "json_object" },
  });

  return completion.choices[0]["message"]["content"];
};

const parseData = async (targetUrl: string) => {
  return {
    name: "test",
    brand: "test",
    price: "test",
    material: "test",
    images: [
      "https://sundae.school/cdn/shop/products/D7_Broccoli_F_006_d04d6c83-5a08-4f82-ac5f-53b85c5a6908_600x600.jpg?v=1668031218",
    ],
  };

  const response = await fetch(targetUrl, { method: "GET" });
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const htmlString = await response.text();
  const root = parse(htmlString);
  const responseJson =
    "'name': '', 'brand': '', 'price': '', 'material': '', 'images': []";
  const data = await parseMetaTags(root, responseJson);
  return data !== null ? JSON.parse(data) : null;
};

export default parseData;
