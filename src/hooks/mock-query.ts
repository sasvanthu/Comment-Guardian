import { useState, useEffect } from "react";

export function useQuery({ queryKey, queryFn }: any) {
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  useEffect(() => {
    setIsLoading(true);
    queryFn().then((res: any) => {
      setData(res);
      setIsLoading(false);
    }).catch(() => {
      setIsLoading(false);
    });
  }, [JSON.stringify(queryKey)]);
  
  return { data, isLoading };
}

export function useMutation({ mutationFn, onSuccess }: any) {
  const [isPending, setIsPending] = useState(false);
  
  const mutate = async (variables: any) => {
    setIsPending(true);
    try {
      const res = await mutationFn(variables);
      setIsPending(false);
      if (onSuccess) onSuccess(res);
    } catch (e) {
      setIsPending(false);
    }
  };
  
  return { mutate, isPending, mutateAsync: mutate };
}

export function useQueryClient() {
  return {
    invalidateQueries: () => {},
  };
}
