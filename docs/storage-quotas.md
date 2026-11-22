# Upload storage

The quota is shared across the account. Standard users start with 512 MiB and active Plus users start with 1 GiB. The sidebar shows usage and warns at 80%. An upload that would exceed the quota is rejected with its remaining-space details. Existing materials are kept when a membership expires or the account is already over its quota. Users can delete materials or conversations to free quota.

Storage includes retained original PDFs, extracted text for other uploaded course documents, and study chat attachments. The size follows the retained storage representation, including base64 where used. It excludes derived indexes, backups, and files outside these learning flows. Use the server's filesystem metrics alongside this dashboard to track available physical space.

In **Developer → Upload storage and alerts**, the creator can see aggregate usage, accounts at or near quota, blocked accounts over the past seven days and pending requests. The sidebar's **Upload storage** dialog opens the existing Plus settings or submits an extra-storage request. A request does not charge the user. A creator grant adds 1 GiB to the account and clears the request. Active Plus and storage grants are independent.
