'use client';

import Image from "next/image";
import parseData from "@/app/actions";

const Test = () => {

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      console.log("Calling server function...");
      console.log(event.target.prompt.value);
      const result = await parseData(event.target.prompt.value);
      console.log(result);
      result['images'].forEach((image: string) => {
        console.log(image);
      });
      console.log(result['description']);
    } catch (error) {
      console.error('Failed to call server function:', error);
      // Handle errors
    }
  };

  return (
    <div className="container mx-auto bg-gray-200 rounded-xl shadow border p-8 m-10">
      <p className="text-3xl text-gray-700 font-bold mb-5">
        Add a link to a product page
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
