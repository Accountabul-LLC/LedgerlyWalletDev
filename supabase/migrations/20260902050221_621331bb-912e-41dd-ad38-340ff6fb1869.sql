CREATE POLICY "No browser access to Joey sign-in challenges"
ON public.joey_auth_nonces
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);