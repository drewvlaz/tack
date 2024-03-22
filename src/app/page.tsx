"use client";

import React, { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
// import Image from 'next/image'; // enforces cors policy, cant use for now
import parseData from "@/app/actions";
import Piece from "@/components/piece";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";

const BoardEditor = () => {
  const [pieces, setPieces] = useState<JSX.Element[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  const formSchema = z.object({
    prompt: z.string().url(),
  });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      prompt: "",
    },
  });

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    setLoading(true);

    try {
      console.log("Calling server function on input:", values.prompt);
      const result = await parseData(values.prompt);

      console.log(result);
      console.log(result.length);

      if (result === null) {
        console.log("Result is null, skipping rendering.");
        return;
      }

      result["images"].forEach((image: string) => {
        console.log(image);
      });
      setPieces((prevItems) => [
        ...prevItems,
        <Piece
          key={result["name"]}
          name={result["name"]}
          brand={result["brand"]}
          material={result["material"]}
          description={result["description"]}
          images={result["images"]}
          link={values.prompt}
        />,
      ]);
      console.log(result["images"][0]);
    } catch (error) {
      console.error("Failed to call server function:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto border bg-gray-100 p-8 shadow">
      <p className="mb-5 text-3xl font-bold text-gray-700">
        Welcome to the test page!
      </p>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          <FormField
            control={form.control}
            name="prompt"
            render={({ field }) => (
              <FormItem>
                <FormLabel>What do you want to add?</FormLabel>
                <FormControl className="w-96">
                  <Input placeholder="https://example.com" {...field} />
                </FormControl>
                {/* <FormDescription>Adds a product to your board</FormDescription> */}
                <FormMessage />
                <Button type="submit">{loading ? "Loading..." : "Add"}</Button>
              </FormItem>
            )}
          />
        </form>
      </Form>
      <div className="mt-5 grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {pieces.length > 0 &&
          pieces.map((piece, index) => <div key={index}>{piece}</div>)}
      </div>
    </div>
  );
};

export default BoardEditor;
