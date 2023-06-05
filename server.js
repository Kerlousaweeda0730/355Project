const http = require('http');
const fs = require('fs');
const path = require('path')
const url = require('url');
const querystring = require('querystring');
const https = require('https');
const port = 5001;

// Google Drive API credentials
const CLIENT_ID = '782695687783-5o3nulohkqeoj8gshu2qb5agjb74mdjg.apps.googleusercontent.com';
const CLIENT_SECRET = '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';
const REDIRECT_URI = `http://localhost:${port}/oauth2callback`;
const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const SCOPES = 'https://www.googleapis.com/auth/drive';



const server = http.createServer((req, res) => {
    const { pathname, query } = url.parse(req.url);
    const params = querystring.parse(query);

    if (pathname === '/') { // sending home page to user on root path
        res.writeHead(200, { 'Content-Type': 'text/html' });
        fs.readFile('./index.html', (error, data) => {
            if (error) {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('Internal Server Error');
                return;
            }
            res.end(data);
        });
    } else if (pathname === '/do_mashup') { //the main api where we will mashup 2 apis
        let body = '';
        req.on('data', chunk => { ///getting formdata that user submitted.
            body += chunk.toString();
        });

        req.on('end', () => {
            const formData = url.parse('?' + body, true).query;
            const { width, height, is_young, is_grayscale, access_token } = formData

            ///optional option for image
            let option = ""
            if (is_young) {
                option += "y"
            }
            if (is_grayscale) {
                option += "g"
            }

            let api1_url = `https://placekeanu.com/${width}/${height}/${option}`

            ///donwloading the image
            const image_name = `keanu${new Date().valueOf()}.svg`
            const file = fs.createWriteStream(image_name);
            console.log("API 1 has been called")
            const imageReq = https.get(api1_url, response => {
                response.pipe(file);

                file.on('finish', () => {
                    file.close(() => {
                        console.log("Image has been downloaded")

                        //upload image to drive
                        const imageData = fs.readFileSync(image_name);

                        const boundary = '-------314159265358979323846';
                        const delimiter = "\r\n--" + boundary + "\r\n";
                        const closeDelimiter = "\r\n--" + boundary + "--";

                        const metadata = {
                            name: image_name
                        };

                        //creating multipart data that will be uploaded to drive.
                        const multipartRequestBody =
                            delimiter +
                            'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
                            JSON.stringify(metadata) +
                            delimiter +
                            'Content-Type: image/svg+xml\r\n\r\n' +
                            imageData +
                            closeDelimiter;

                        //all api options for google drive
                        const options = {
                            hostname: 'www.googleapis.com',
                            port: 443,
                            path: '/upload/drive/v3/files?uploadType=multipart',
                            method: 'POST',
                            headers: {
                                'Authorization': 'Bearer ' + access_token,
                                'Content-Type': 'multipart/related; boundary=' + boundary,
                                'Content-Length': multipartRequestBody.length
                            }
                        };

                        console.log("API 2 has been called")
                        const imageUploadReq = https.request(options, (response) => {

                            let res_data = '';
                            response.on('data', (chunk) => {
                                res_data += chunk;
                            });
                            response.on('end', () => {
                                fs.unlinkSync(image_name) ///deleting the image that has been downloaded

                                console.log("Image has been uploaded to drive")
                                if (response.statusCode === 200) {
                                    const file_data = JSON.parse(res_data)
                                    res.writeHead(200);
                                    res.end(`image uploaded to drive - File ID: ${file_data.id}`);
                                } else {
                                    res.writeHead(400);
                                    res.end(`image upload to drive failed - ${response.statusMessage}`);
                                }
                            });
                        });

                        imageUploadReq.on('error', (error) => {
                            console.error(error);
                        });

                        imageUploadReq.write(multipartRequestBody);
                        imageUploadReq.end();

                    });
                });
            });

            imageReq.on('error', error => {
                fs.unlink(image_name, () => {
                    console.error(`Error downloading image: ${error.message}`);
                    res.writeHead(500);
                    res.end('Error downloading image');
                });
            });
        });

    } else if (pathname === '/connect_to_drive') {
        // Generate google drive authorization URL and redirect the user to it

        const authUrl = `${AUTH_ENDPOINT}?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}&scope=${SCOPES}`;
        res.writeHead(302, { Location: authUrl });
        res.end();
    } else if (pathname === '/oauth2callback') {
        // Exchange authorization code for access token
        const postData = querystring.stringify({
            code: params.code,
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            redirect_uri: REDIRECT_URI,
            grant_type: 'authorization_code'
        });

        const options = {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            hostname: 'oauth2.googleapis.com',
            path: '/token'
        };

        const tokenReq = https.request(options, (tokenRes) => {
            let data = '';
            tokenRes.on('data', (chunk) => {
                data += chunk;
            });
            tokenRes.on('end', () => {
                const token = JSON.parse(data);
                res.writeHead(302, { Location: `http://localhost:${port}?token=${token.access_token}` });
                res.end();
            });
        });

        tokenReq.on('error', (err) => {
            console.error('Error getting access token:', err.message);
            res.writeHead(500);
            res.end('Error getting access token');
        });

        tokenReq.write(postData);
        tokenReq.end();
    } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
    }
});



// start the server
server.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
