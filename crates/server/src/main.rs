use actix_cors::Cors;
use actix_files::Files;
use actix_web::{middleware, web, App, HttpResponse, HttpServer};
use log::info;
use std::env;

async fn health_check() -> HttpResponse {
    HttpResponse::Ok()
        .content_type("application/json")
        .body(r#"{"status":"ok"}"#)
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    env_logger::init_from_env(env_logger::Env::default().default_filter_or("info"));

    let host = env::var("MANDELBROT_HOST").unwrap_or_else(|_| "0.0.0.0".to_string());
    let port: u16 = env::var("MANDELBROT_PORT")
        .unwrap_or_else(|_| "8080".to_string())
        .parse()
        .expect("MANDELBROT_PORT must be a valid port number");

    let static_dir =
        env::var("MANDELBROT_STATIC_DIR").unwrap_or_else(|_| "./frontend/dist".to_string());

    info!("Starting Mandelbrot Explorer server on {}:{}", host, port);
    info!("Serving static files from: {}", static_dir);

    let static_dir_clone = static_dir.clone();

    HttpServer::new(move || {
        let cors = Cors::default()
            .allow_any_origin()
            .allow_any_method()
            .allow_any_header()
            .max_age(3600);

        App::new()
            .wrap(cors)
            .wrap(middleware::Logger::default())
            .wrap(middleware::Compress::default())
            .route("/api/health", web::get().to(health_check))
            .service(
                Files::new("/", &static_dir_clone)
                    .index_file("index.html")
                    .prefer_utf8(true),
            )
    })
    .bind((host.as_str(), port))?
    .workers(num_cpus())
    .run()
    .await
}

fn num_cpus() -> usize {
    std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(2)
}
