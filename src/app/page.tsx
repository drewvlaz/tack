'use client';

import Image from "next/image";
import React, { useState } from 'react';
import { useFormStatus } from 'react-dom';
import parseData from "@/app/actions";

const Test = () => {
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [pieceImage, setPieceImage] = useState("");

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    // Prevent the default form submit behavior which refreshes the page
    event.preventDefault();
    try {
      const input = (event.target as HTMLFormElement).prompt.value;
      console.log("Calling server function on input:", input);
      const result = await parseData(input);

      if (result === null) {
        console.log("Result is null, skipping rendering.");
        return;
      }

      console.log(result);
      result['images'].forEach((image: string) => {
        console.log(image);
      });
      console.log(result['description']);
      setPieceImage(result['images'][0]);
    } catch (error) {
      console.error('Failed to call server function:', error);
    }

    setIsSubmitted(true);
  };
  const { pending } = useFormStatus();

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
        <button
          type="submit"
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
          aria-disabled={pending}
        >Submit</button>
      </form>
      {isSubmitted && (
        <div>
          <img src={pieceImage} alt="Product image" width={500} height={500} />
        </div>
      )}
    </div>
  );
}

export default Test;
