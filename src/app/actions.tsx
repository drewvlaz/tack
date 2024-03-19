"use server";

// import OpenAI from "openai";
import { parse } from "node-html-parser";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { OpenAI, ChatOpenAI } from "@langchain/openai";
import { PromptTemplate } from "@langchain/core/prompts";
import { loadSummarizationChain } from "langchain/chains";

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
  const tagsToRemove = root.querySelectorAll("script, style, path, footer");
  const attributesToRemove = ["style", "srcset"];
  const allElements = root.querySelectorAll("*");

  tagsToRemove.forEach((item) => item.remove());
  allElements.forEach((elem) => {
    attributesToRemove.forEach((attr) => {
      elem.removeAttribute(attr);
    });
  });

  // const metaTags = root.querySelectorAll("meta");
  // const data = metaTags.map((meta) => meta.getAttribute("content"));
  const data = root.innerHTML;

  // https://api.js.langchain.com/classes/langchain_text_splitter.RecursiveCharacterTextSplitter.html
  const splitter = RecursiveCharacterTextSplitter.fromLanguage("html", {
    chunkSize: 10000,
    chunkOverlap: 20,
  });
  const docs = await splitter.createDocuments([data]);

  // return output
  //   .map((doc) => doc.pageContent.replace(/\s+/g, " ").trim())
  //   .join("\n\n\n");

  const model = new OpenAI({
    openAIApiKey: process.env.OPENAI_API_KEY,
    modelName: "gpt-3.5-turbo-0125",
    // maxTokens: 128,
    // }).bind({
    //   response_format: {
    //     type: "json_object",
    //   },
  });

  const combineModel = new OpenAI({
    openAIApiKey: process.env.OPENAI_API_KEY,
    modelName: "gpt-3.5-turbo-0125",
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

  const responseJson =
    "'name': '', 'brand': '', 'price': '', 'material': '', 'description': '', 'images': []";
  const combinePromptTemplate = new PromptTemplate({
    template:
      `You are a backend API that when given a list of HTML meta tags, you return \
      the details of the product in the json format ${responseJson} and nothing else. The data you \
      are given is {text}. If you cannot determine the material, return "Unknown". \
      For the images, if there are both http and https links, \
      you should return the https links and no duplicates.`
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

  const res = await summaryChain.call({
    input_documents: docs,
  });

  return res !== null ? JSON.parse(res["text"]) : null;

  // llm = ChatOpenAI(temperature=0, model="gpt-3.5-turbo-16k-0613")
  // text_splitter = RecursiveCharacterTextSplitter(
  //     separators=["\n\n", "\n"], chunk_size=10000, chunk_overlap=500)
  // docs = text_splitter.create_documents([content])
  // map_prompt = """
  // Write a summary of the following text for {objective}:
  // "{text}"
  // SUMMARY:
  // """
  // map_prompt_template = PromptTemplate(
  //     template=map_prompt, input_variables=["text", "objective"])
  //
  // summary_chain = load_summarize_chain(
  //     llm=llm,
  //     chain_type='map_reduce',
  //     map_prompt=map_prompt_template,
  //     combine_prompt=map_prompt_template,
  //     verbose=True
  // )
  //
  // output = summary_chain.run(input_documents=docs, objective=objective)
  //
  // return output

  // const responseJson =
  //   "{ 'name': '', 'brand': '', 'price': '', 'material': '', 'description': '', 'images': [] }";
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
